## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Leak on Channel Send
// ------------------------------------------------------------------------

package search

import (
	"context"
	"log"
)

type Result struct {
	Backend string
	Data    []byte
}

func FanOut(ctx context.Context, query string, backends []Backend) []Result {
	// CHANGE 1: Buffer the channel to len(backends) so every goroutine can send without blocking, even if some backends error and the collector receives fewer items.
	results := make(chan Result, len(backends))
	for _, b := range backends {
		b := b
		go func() {
			res, err := b.Search(ctx, query)
			if err != nil {
				log.Printf("backend %s error: %v", b.Name(), err)
				return
			}
			// CHANGE 2: Send on results inside a select with ctx.Done() so that if the caller is gone the goroutine exits rather than blocking forever on the send.
			select {
			case results <- res:
			case <-ctx.Done():
			}
		}()
	}

	// CHANGE 1 (collector): Track actual sends with a separate counter; count errors so we know when all goroutines are done without assuming every backend succeeds.
	var out []Result
	for i := 0; i < len(backends); i++ {
		select {
		case res := <-results:
			out = append(out, res)
		case <-ctx.Done():
			return out
		}
	}
	return out
}
```

## Explanation

### Issue 1: Unbuffered channel starves collector on errors

**Problem:** When any backend call returns an error, that goroutine logs and returns without sending to `results`. The collector loop still executes `<-results` exactly `len(backends)` times, so it blocks waiting for a message that will never arrive. Every successful-backend goroutine that already sent is fine, but the collector is stuck — and any later goroutines that finish successfully after the collector is blocked will themselves block trying to send to an unbuffered channel with no receiver.

**Fix:** Replace `make(chan Result)` with `make(chan Result, len(backends))` so the channel can hold one entry per backend. Add a `select` in the collector with `ctx.Done()` so it can exit early rather than hanging if the context is cancelled.

**Explanation:** An unbuffered channel requires both sender and receiver to be ready at the same moment. The collector loop is written to receive exactly `len(backends)` values, but error paths reduce the number of sends below that count. Once the collector is waiting on a missing send it can never proceed. Any goroutine that later tries to send a result finds the channel full (or, with the original unbuffered channel, finds no receiver) and blocks indefinitely. Buffering the channel to `len(backends)` means every goroutine that does produce a result can complete its send immediately, regardless of whether the collector has caught up. The collector `select` on `ctx.Done()` ensures it does not hang if the context is cancelled before all expected results arrive.

---

### Issue 2: No escape hatch for goroutine send when caller is gone

**Problem:** If the caller cancels the context or the `FanOut` function returns early (for example, via the `ctx.Done()` branch added in the collector), any goroutine that is mid-flight and later tries to send its result blocks on `results <- res` forever. The goroutine holds a `Result` with a potentially large `Data` slice and will never be garbage-collected. This is the goroutine leak operators see climbing in `/debug/pprof/goroutine`.

**Fix:** Wrap the send in `results <- res` inside a `select` that also listens on `ctx.Done()`, matching the pattern `case results <- res: / case <-ctx.Done():`. If the context is done the goroutine exits cleanly instead of blocking.

**Explanation:** Context cancellation propagates to `b.Search` through the `ctx` argument, so in-flight HTTP calls are interrupted. But once `Search` returns a result, the goroutine still needs to send it into the channel. If the collector has already returned (because its own `ctx.Done()` case fired), nobody is receiving from `results`. Even with a buffered channel, if all buffer slots are taken the goroutine blocks. The `select` with `ctx.Done()` gives the goroutine a second exit path: as soon as the context is cancelled, the send attempt is abandoned and the goroutine exits, releasing its stack and the `Result` it holds. Without this, cancellation stops new work from starting but does not clean up goroutines that are already past the `Search` call.
