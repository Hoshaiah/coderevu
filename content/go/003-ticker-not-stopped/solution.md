## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Ticker Goroutine Never Exits
// ------------------------------------------------------------------------

package metrics

import (
	"context"
	"log"
	"time"
)

// CHANGE 2: Return a done channel so callers can wait for the goroutine to exit before considering shutdown complete.
func StartReporter(ctx context.Context, interval time.Duration) <-chan struct{} {
	ticker := time.NewTicker(interval)
	// CHANGE 2: Allocate the done channel that will be closed when the goroutine exits.
	done := make(chan struct{})
	go func() {
		// CHANGE 2: Close done on exit so callers blocking on <-done unblock.
		defer close(done)
		// CHANGE 1: Stop the ticker when the goroutine exits so its internal timer goroutine and channel are released.
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := pushMetrics(); err != nil {
					log.Printf("metrics push error: %v", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	return done
}

func pushMetrics() error { return nil }
```

## Explanation

### Issue 1: Ticker never stopped on cancellation

**Problem:** After the context is cancelled the goroutine exits via `return`, but `ticker.Stop()` is never called. The `time.Ticker` keeps its internal runtime timer goroutine alive and holds a reference to the backing channel, so neither is garbage-collected. After each rolling deploy (which starts a fresh `StartReporter` without terminating the old process) the count of leaked tickers and goroutines grows until the operator notices elevated memory and goroutine counts in profiles.

**Fix:** Add `defer ticker.Stop()` immediately inside the goroutine, before the `for` loop, as shown at the `CHANGE 1` site. `Stop` tells the runtime to release the timer, drains no channel, and is safe to call exactly once.

**Explanation:** `time.NewTicker` registers an internal goroutine with the Go runtime that fires the channel every `interval`. Calling `ticker.Stop()` signals that goroutine to exit and lets the GC collect the `Ticker` struct and its channel. Without it, the internal goroutine holds a reference to the channel, preventing collection. Using `defer` guarantees `Stop` runs even if the goroutine exits through a panic path added later. One related pitfall: `Stop` does not close `ticker.C`, so if you need to drain a pending tick after stopping, you must do so explicitly with a non-blocking receive — but in this select-loop pattern that is not necessary because the goroutine is already exiting.

---

### Issue 2: No shutdown acknowledgment returned to caller

**Problem:** `StartReporter` returns nothing, so any code that wants to wait for the reporter to finish before, say, flushing remaining metrics or exiting `main`, has no way to do so. In practice the process may exit or the next stage of shutdown may begin while the goroutine is still mid-push, causing lost or partial metric pushes that are hard to reproduce.

**Fix:** Change the return type to `<-chan struct{}` and return a `done` channel that is closed via `defer close(done)` when the goroutine exits, as shown at the `CHANGE 2` sites. Callers can block with `<-StartReporter(ctx, interval)` or select on it with a timeout.

**Explanation:** A goroutine started with `go func()` runs concurrently with no built-in way for its launcher to observe termination. Closing a channel on exit is the idiomatic Go signal: any number of receivers unblock immediately when the channel closes, and it costs nothing if nobody listens. Returning `<-chan struct{}` (read-only) prevents callers from accidentally sending to or closing the channel themselves. An alternative is `sync.WaitGroup`, but a channel return value is easier to compose with `select` for timeout-aware shutdown sequences.
