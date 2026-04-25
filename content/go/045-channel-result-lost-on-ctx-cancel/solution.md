## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Result Lost When Context Cancelled
// ------------------------------------------------------------------------

package cache

import (
	"context"
	"fmt"
	"time"
)

type Value struct{ Data string }

func LoadWithTimeout(key string, loadFn func(string) (Value, error)) (Value, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	type result struct {
		v   Value
		err error
	}

	// CHANGE 1: Use a buffered channel of size 1 so the goroutine can always send its result without blocking, even if the caller has already moved on due to context cancellation. Without the buffer the goroutine leaks and its result is lost.
	ch := make(chan result, 1)
	go func() {
		v, err := loadFn(key)
		ch <- result{v, err}
	}()

	select {
	// CHANGE 2: Check ch first in a non-blocking inner select before falling through to ctx.Done(), so a result that arrives at the same time as the deadline is never discarded in favour of the timeout branch.
	case res := <-ch:
		return res.v, res.err
	case <-ctx.Done():
		// Drain the channel in case the goroutine already sent before we got here.
		select {
		case res := <-ch:
			return res.v, res.err
		default:
		}
		return Value{}, fmt.Errorf("load timeout for key %q: %w", key, ctx.Err())
	}
}
```

## Explanation

### Issue 1: Goroutine Leak and Lost Result via Unbuffered Channel

**Problem:** When the `ctx.Done()` branch fires first, the `select` returns immediately. The background goroutine then tries to send on `ch`, but nobody is receiving. Because `ch` is unbuffered the goroutine blocks indefinitely, leaking memory. The successfully-loaded value is thrown away, so the cache never gets filled and subsequent callers trigger another expensive reload.

**Fix:** Replace `make(chan result)` with `make(chan result, 1)`. The goroutine can now complete its send whether or not the caller is still waiting, and the channel holds the value until it is either read or garbage-collected together with the channel.

**Explanation:** An unbuffered channel requires both sender and receiver to be ready at the same time. When the deadline fires, `LoadWithTimeout` returns, dropping its reference to the `select` statement, so the receive side disappears. The goroutine stays alive forever, holding a stack frame and whatever memory `loadFn` allocated. A buffer of 1 decouples the send from the receive: the goroutine writes the result into the slot and exits cleanly regardless of what the caller is doing. Because the goroutine always exits, the runtime can collect the channel and its contents when no references remain.

---

### Issue 2: Race Between ctx.Done() and Result Channel Gives Wrong Branch

**Problem:** Go's `select` picks a case uniformly at random when multiple cases are ready simultaneously. If `loadFn` finishes at almost exactly the same moment the deadline expires, `ctx.Done()` can win the race even though a valid result is sitting in `ch`. The caller logs a timeout error, skips the cache write, and the successful load is silently discarded.

**Fix:** After the `ctx.Done()` case wins, add an inner `select { case res := <-ch: return res.v, res.err; default: }` before returning the timeout error. This drains the channel if the goroutine already sent its result, converting an apparent timeout into a successful return. The outer `case res := <-ch:` is also listed first, which gives it a slight structural advantage under Go's randomized selection, though the inner drain is the reliable guard.

**Explanation:** Go's runtime deliberately randomizes `select` to avoid starvation, so ordering cases in source does not guarantee which fires when both are ready. The only way to guarantee a result is never discarded is to explicitly check `ch` after observing `ctx.Done()`. The non-blocking inner `select` with a `default` does exactly that: if the goroutine beat us to the send, we return its value; if it hasn't sent yet, `default` fires and we return the timeout error. Together with the buffered channel from Issue 1, this ensures the goroutine's value is always retrievable up to the point where we decide to give up.
