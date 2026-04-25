## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Cancel Called After Return
// ------------------------------------------------------------------------

package rpc

import (
	"context"
	"time"
)

type Response struct{ Data []byte }

func CallWithTimeout(ctx context.Context, call func(context.Context) (*Response, error)) (*Response, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	// CHANGE 1+2: defer cancel() immediately after creation so it is called on every return path (error or success), preventing timerCtx goroutine leaks.
	defer cancel()

	resp, err := call(timeoutCtx)
	if err != nil {
		return nil, err
	}

	return resp, nil
}
```

## Explanation

### Issue 1: `cancel` not called on error path

**Problem:** When `call(timeoutCtx)` returns a non-nil error, the function returns immediately without calling `cancel()`. Every such call leaves a `timerCtx` goroutine running inside the Go runtime's timer heap until the 5-second timeout expires naturally. In a service that handles thousands of requests per minute with any non-trivial error rate, these goroutines accumulate and hold file descriptors, driving up the FD count until the OS rejects new connections.

**Fix:** Remove the explicit `cancel()` call before the success return and replace it with `defer cancel()` placed immediately after `context.WithTimeout` returns. The deferred call runs on every return path, including the early error return.

**Explanation:** `context.WithTimeout` internally calls `time.AfterFunc` to arrange cancellation at the deadline. Until `cancel()` is called or the deadline fires, the runtime keeps that timer goroutine alive and the context object reachable. When the caller returns an error and skips the explicit `cancel()`, that goroutine stays live for up to 5 seconds. At high call rates the steady-state count of leaked goroutines equals (error calls per second × 5 seconds). Each `timerCtx` also holds an internal pipe or channel that counts against the process FD limit. The fix ensures `cancel()` fires as soon as `CallWithTimeout` exits, releasing the timer immediately rather than waiting for the deadline.

---

### Issue 2: `cancel` placement relies on manual call instead of `defer`

**Problem:** Even on the non-error path, `cancel()` is called just before `return resp, nil` rather than via `defer`. This works today but is fragile: any future change that adds another early return (a validation check, a secondary call, etc.) will silently reintroduce the leak without any compiler or linter warning.

**Fix:** Use `defer cancel()` on the line immediately after `context.WithTimeout`, and remove the manual `cancel()` call that preceded `return resp, nil`. The reference solution replaces both with a single `defer cancel()` statement.

**Explanation:** The Go documentation for `context.WithTimeout` (and `WithCancel`) explicitly states that the caller should call `cancel` as soon as the operations running in the context complete, and the idiomatic way to guarantee this is `defer`. Placing `defer cancel()` right after the context is created makes the cleanup self-documenting and immune to future edits that add branching logic. A common pitfall is deferring inside a loop — each iteration defers a new cancel that won't fire until the surrounding function returns — but that does not apply here since this is a simple function with a single timeout context.
