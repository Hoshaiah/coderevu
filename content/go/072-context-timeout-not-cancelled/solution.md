## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Timeout Cancel Leak
// ------------------------------------------------------------------------

package gateway

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

const upstreamTimeout = 5 * time.Second

func Forward(ctx context.Context, req *http.Request) (*http.Response, error) {
	// CHANGE 1: capture the cancel func and defer it so the timer is always released when Forward returns, preventing goroutine and resource leaks.
	ctx, cancel := context.WithTimeout(ctx, upstreamTimeout)
	// CHANGE 2: defer cancel() immediately after capturing it so every exit path (early error return or normal return) calls it, not just the happy path.
	defer cancel()

	upstreamReq, err := http.NewRequestWithContext(ctx, req.Method, req.URL.String(), req.Body)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(upstreamReq)
	if err != nil {
		return nil, fmt.Errorf("upstream do: %w", err)
	}
	return resp, nil
}
```

## Explanation

### Issue 1: Cancel function discarded, timer goroutine leaked

**Problem:** Every call to `Forward` creates a new derived context via `context.WithTimeout`, but the returned cancel function is thrown away by assigning it to `_`. The Go runtime keeps an internal timer alive until either the deadline fires or the cancel function is called. Because the cancel function is never called, the timer (and the associated goroutine that monitors it) lives until the 5-second deadline elapses — and under thousands of requests per second, thousands of such timers accumulate simultaneously, causing unbounded memory and goroutine growth.

**Fix:** Replace `ctx, _ = context.WithTimeout(...)` with `ctx, cancel := context.WithTimeout(...)` and add `defer cancel()` on the very next line, as shown at CHANGE 1 and CHANGE 2 in the reference solution.

**Explanation:** `context.WithTimeout` internally calls `time.AfterFunc` to schedule a goroutine that will cancel the context when the deadline arrives. That goroutine holds a reference to the context and its associated state. The only way to release it early is to call the cancel function. If the cancel function is discarded, the runtime has no handle to stop the timer; it must wait the full `upstreamTimeout` (5 seconds) before the goroutine exits naturally. At 1 000 requests per second, that means up to 5 000 timer goroutines are alive at any moment just from this one site. Using `defer cancel()` guarantees cleanup on every code path — including the two early-return error branches — so the timer is freed as soon as `Forward` returns, typically well under 5 seconds. A related pitfall: placing `cancel()` only on the happy-path return (without `defer`) would still leak on error returns.

---

### Issue 2: Blank identifier hides leak from static analysis

**Problem:** Writing `ctx, _ = context.WithTimeout(...)` (blank identifier for the cancel func) suppresses the warning that `go vet` and `staticcheck` (SA4006, SA1006) would normally emit about an unused or discarded cancel function. The leak therefore survives code review and CI without any tool raising a flag.

**Fix:** Replace the blank identifier `_` with the named variable `cancel` (CHANGE 1), which allows `go vet` and `staticcheck` to verify that `cancel` is actually called before the function returns, and makes the intent clear to reviewers.

**Explanation:** The Go toolchain treats `_` as an intentional discard, so it never warns that the value is important. By naming the variable `cancel`, static analysis tools can confirm it is used (via the `defer cancel()` call) and will flag it if a future edit accidentally removes that call. Beyond tooling, the named variable serves as documentation: any reader immediately sees that a cleanup step is required and that `defer cancel()` fulfills it. This is a common pattern throughout the standard library and makes auditing context lifetimes straightforward.
