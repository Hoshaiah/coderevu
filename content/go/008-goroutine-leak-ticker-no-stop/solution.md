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

func startReporter(ctx context.Context, flush func()) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		// CHANGE 2: Stop the ticker when the goroutine exits so its internal goroutine and channel are freed.
		defer ticker.Stop()
		for {
			select {
			// CHANGE 1: Add a ctx.Done() case so the goroutine exits when the caller cancels the context.
			case <-ctx.Done():
				return
			case <-ticker.C:
				flush()
				log.Println("metrics flushed")
			}
		}
	}()
}
```

## Explanation

### Issue 1: Goroutine Never Exits on Context Cancellation

**Problem:** The `select` inside the goroutine only listens on `ticker.C`. When the caller cancels the `context.Context` (e.g., on server shutdown or at the end of a test), nothing unblocks the goroutine, so it keeps running forever. In integration tests that call `startReporter` in a loop, each call adds one permanent goroutine, and `pprof` shows them accumulating across test runs.

**Fix:** A new `case <-ctx.Done(): return` is added to the `select` statement (CHANGE 1). When the context is cancelled or its deadline expires, `ctx.Done()` is closed and the goroutine returns.

**Explanation:** A `select` with only one `case` is functionally equivalent to a blocking read on that single channel. The `context.Context` passed in is meant to be the lifetime signal for the work, but it has no effect unless the goroutine actually reads from `ctx.Done()`. Adding the case makes the goroutine participate in Go's cooperative cancellation pattern: whoever owns the context (the test, the HTTP server, `main`) calls `cancel()` and the goroutine exits on the next iteration. One pitfall: if `flush()` blocks for a long time, cancellation will only be noticed after `flush()` returns, but that is acceptable for a periodic reporter.

---

### Issue 2: Ticker Is Never Stopped

**Problem:** `time.NewTicker` allocates an internal goroutine and a channel that keep running until `Stop()` is called. Even if the outer goroutine were somehow killed, the ticker's resources are not reclaimed. Over many test iterations this contributes to the slow memory growth operators observed.

**Fix:** `defer ticker.Stop()` is added immediately after the ticker is created (CHANGE 2). This ensures `Stop` is called whenever the goroutine returns, whether due to context cancellation or any future early-return path.

**Explanation:** `time.NewTicker` internally uses the Go runtime timer machinery. Without `Stop()`, the runtime holds a reference to the ticker and keeps firing events into `ticker.C` indefinitely. The `defer` placement right after creation is the standard Go idiom — similar to `defer file.Close()` — because it runs regardless of which `return` path the goroutine takes. A subtle point: after `Stop()`, the channel is not closed, so any pending value already in `ticker.C` can still be drained, but no new ticks will arrive. This is fine here because we are about to exit anyway.
