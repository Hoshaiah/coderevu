## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Timeout Reused Across Retries
// ------------------------------------------------------------------------

package downstream

import (
	"context"
	"fmt"
	"time"
)

func callWithRetry(ctx context.Context, req Request) (Response, error) {
	var lastErr error

	for attempt := 0; attempt < 3; attempt++ {
		// CHANGE 1: create a fresh per-attempt context inside the loop so each attempt gets its own independent 2-second deadline instead of sharing one deadline created before the loop.
		attemptCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		resp, err := doCall(attemptCtx, req)
		// CHANGE 2: call cancel immediately after each attempt completes to release the child context's resources rather than waiting until callWithRetry returns.
		cancel()
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}
	return Response{}, fmt.Errorf("all attempts failed: %w", lastErr)
}

type Request struct{ ID string }
type Response struct{ Body string }

func doCall(ctx context.Context, req Request) (Response, error) { return Response{}, nil }
```

## Explanation

### Issue 1: Shared deadline consumed across retries

**Problem:** All three retry attempts share the same `context.WithTimeout` created before the loop. If the first attempt takes 1.8 seconds before failing, only 0.2 seconds remain for the second and third attempts. The operator sees `context deadline exceeded` on attempts 2 or 3 even when the downstream has recovered and would respond quickly.

**Fix:** Move `context.WithTimeout(ctx, 2*time.Second)` inside the `for` loop so that `attemptCtx` and `cancel` are declared fresh on every iteration. The outer `ctx` (which has no pre-existing deadline) is the parent each time, so each child gets a full 2-second window.

**Explanation:** `context.WithTimeout` records an absolute deadline equal to `time.Now().Add(timeout)` at the moment it is called. Calling it once before the loop fixes that deadline to a single point in time; every subsequent use of the returned context checks against that same point. By calling it at the top of each loop iteration, `time.Now()` is evaluated freshly, giving a new absolute deadline 2 seconds in the future for each attempt. One pitfall: if `ctx` itself had a shorter overall deadline passed in from the caller, each child context would still be bounded by that parent deadline — which is the correct behavior when the caller wants a total budget across all retries.

---

### Issue 2: Per-attempt cancel not called promptly

**Problem:** With the original code, `defer cancel()` fires once when `callWithRetry` returns. Even with the fix in Issue 1, if `cancel` were deferred inside the loop, only the last iteration's cancel would be deferred properly; earlier iterations' cancels would still leak until function exit. The child contexts and their associated timer goroutines accumulate in memory for the lifetime of the function call.

**Fix:** Replace `defer cancel()` with a direct `cancel()` call immediately after `doCall(attemptCtx, req)` returns on each iteration. This eagerly releases the timer and any other resources held by the child context as soon as the attempt is done.

**Explanation:** Every `context.WithTimeout` internally starts a timer goroutine that fires `cancel` when the deadline is reached. If you never call `cancel` yourself (or defer it until much later), that goroutine runs for the full remaining timeout period even after `doCall` already returned an error. Over three attempts this means up to three 2-second timer goroutines can be live simultaneously. Calling `cancel()` right after `doCall` stops the timer immediately and releases the associated memory. The Go documentation explicitly says: "Failing to call the CancelFunc leaks the child and its children until the parent is canceled or the timer fires."
