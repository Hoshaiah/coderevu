## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Timeout Consumed by Retries
// ------------------------------------------------------------------------

package rpc

import (
	"context"
	"errors"
	"fmt"
	"time"
)

const (
	attemptTimeout = 2 * time.Second
	maxRetries     = 5
)

func callWithRetry(ctx context.Context, call func(context.Context) error) error {
	// CHANGE 1: Removed the single WithTimeout call that was here before the loop; each attempt now gets its own fresh context inside the loop.

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		// CHANGE 2: Check the parent context before starting each attempt so we stop immediately if the caller's deadline is already exceeded.
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("parent context done before attempt %d: %w", i+1, err)
		}

		// CHANGE 1: Create a fresh per-attempt context inside the loop so each retry gets a full attemptTimeout regardless of how long previous attempts took.
		attemptCtx, cancel := context.WithTimeout(ctx, attemptTimeout)
		err := call(attemptCtx)
		cancel()

		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("all %d attempts failed: %w", maxRetries, lastErr)
}
```

## Explanation

### Issue 1: Per-attempt context created outside retry loop

**Problem:** Callers set `maxRetries` to 5 expecting up to 5 attempts, but only the first attempt ever runs. After `attemptTimeout` (2 seconds) elapses, the context is cancelled, and every subsequent call to `call(ctx)` inside the loop immediately returns `context.DeadlineExceeded` — but the context was already dead before those calls even started, so no real RPC is sent.

**Fix:** Remove the `context.WithTimeout` call that preceded the loop and replace it with a `context.WithTimeout(ctx, attemptTimeout)` call at the top of the loop body, storing the result in `attemptCtx`. Call `cancel()` immediately after `call(attemptCtx)` returns, then use `err` from that call for the retry logic.

**Explanation:** `context.WithTimeout` returns a context that is cancelled after the given duration — permanently. Once the 2-second window closes, that context object is done forever; passing it to any function that checks `ctx.Err()` or selects on `ctx.Done()` will see an immediate cancellation. By moving the `WithTimeout` inside the loop, each iteration derives a brand-new child context from the still-live parent, giving each attempt its own independent 2-second budget. Calling `cancel()` right after the attempt (rather than deferring it to function exit) is also important: without it, each iteration's timer goroutine leaks until the parent context eventually expires.

---

### Issue 2: Parent context expiry not checked between retries

**Problem:** If the parent context provided by the caller expires mid-retry (e.g., the caller's 10-second deadline is hit after several slow attempts), the loop continues and launches another `context.WithTimeout(ctx, ...)` derived from an already-cancelled parent. `context.WithTimeout` on a cancelled parent returns a context that is immediately done, so `call` fails instantly and the error bubbles up in a confusing way — or the loop burns through remaining iterations with zero-duration attempts.

**Fix:** Add `if err := ctx.Err(); err != nil { return ... }` at the top of the loop body, before creating `attemptCtx`. This is the `CHANGE 2` site in the reference solution.

**Explanation:** `context.WithTimeout(parent, d)` inherits the parent's deadline: if the parent is already cancelled, the child is cancelled immediately too. Without the explicit `ctx.Err()` check, the code doesn't distinguish between "the per-attempt timeout fired, retry is warranted" and "the caller's overall deadline is gone, further retries are pointless". Checking `ctx.Err()` before each attempt surfaces the parent cancellation cleanly and returns immediately with a clear error, rather than spinning through retries that all fail in microseconds and eventually returning a misleading "all 5 attempts failed" error.
