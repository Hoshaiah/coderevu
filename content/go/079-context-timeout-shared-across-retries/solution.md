## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Timeout Shared Across All Retries
// ------------------------------------------------------------------------

package httpclient

import (
	"context"
	"errors"
	"time"
)

var ErrTransient = errors.New("transient")

func do(ctx context.Context) error { return ErrTransient }

func DoWithRetry(parent context.Context, maxAttempts int, timeout time.Duration) error {
	// CHANGE 1: Removed the single context.WithTimeout call that was here before the loop; each attempt now creates its own timeout context so the deadline resets on every retry.

	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		// CHANGE 1: Create a fresh per-attempt context inside the loop so each attempt gets the full timeout duration, not a shrinking slice of one shared deadline.
		// CHANGE 2: Capture the cancel func and defer/call it after each attempt to avoid leaking the timer goroutine that context.WithTimeout creates.
		ctx, cancel := context.WithTimeout(parent, timeout)
		err := do(ctx)
		cancel()
		if err == nil {
			return nil
		}
		if !errors.Is(err, ErrTransient) {
			return err
		}
		lastErr = err
	}
	return lastErr
}
```

## Explanation

### Issue 1: Shared Timeout Across All Retries

**Problem:** The single `context.WithTimeout(parent, timeout)` call before the loop creates one context whose deadline is set once and counts down continuously. By the time the first attempt finishes (possibly using most or all of `timeout`), the context handed to the second and subsequent attempts is already expired or has only microseconds left, so they fail immediately with `context deadline exceeded`.

**Fix:** Remove the `context.WithTimeout` call before the loop and add `ctx, cancel := context.WithTimeout(parent, timeout)` as the first statement inside the `for` loop body, so a brand-new context with a full `timeout` duration is created for each attempt.

**Explanation:** `context.WithTimeout` sets an absolute deadline equal to `time.Now().Add(timeout)` at the moment it is called. If that moment is before the loop, all retries share the same absolute deadline. Moving the call inside the loop means `time.Now()` is evaluated fresh on each iteration, giving every attempt its own independent deadline. A related pitfall: if the parent context itself has a shorter deadline than `timeout`, each child context will still be bounded by the parent — that is intentional and correct behavior, not a bug.

---

### Issue 2: Per-Attempt Context Cancel Not Called, Leaking Timer Goroutines

**Problem:** `context.WithTimeout` internally starts a timer goroutine. If `cancel()` is never called, that goroutine keeps running until the deadline fires or the parent is cancelled. With multiple retries this creates one leaked goroutine per attempt for the full duration of `timeout`.

**Fix:** Call `cancel()` immediately after `do(ctx)` returns, before the error checks, at the `CHANGE 2` site. This is a direct `cancel()` call on the line right after `do`, not a `defer` inside the loop body (a `defer` inside a loop only fires when the enclosing function returns, not at the end of each iteration).

**Explanation:** The Go runtime does not automatically reclaim a context's timer goroutine just because the context value goes out of scope. The goroutine is only stopped when either `cancel()` is called or the deadline elapses. Inside a retry loop a `defer cancel()` placed in the loop body is deferred to function exit, not to the next loop iteration, so all cancels pile up and fire only when `DoWithRetry` returns. Calling `cancel()` explicitly right after `do(ctx)` ensures each timer is released before the next iteration starts.
