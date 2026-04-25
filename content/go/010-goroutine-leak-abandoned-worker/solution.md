## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Abandoned Worker Goroutine on Shutdown
// ------------------------------------------------------------------------

package ingest

import (
	"context"
	"log"
	"sync"
)

type Record struct {
	ID   int
	Data []byte
}

// CHANGE 1: Accept ctx so the worker can exit when the context is cancelled, instead of blocking forever on the channel.
func runWorker(ctx context.Context, records <-chan Record, save func(Record) error) {
	for {
		// CHANGE 1: Use a select so that a context cancellation unblocks the goroutine even though records is never closed.
		select {
		case <-ctx.Done():
			return
		case rec, ok := <-records:
			if !ok {
				return
			}
			if err := save(rec); err != nil {
				log.Printf("save failed: %v", err)
			}
		}
	}
}

func StartWorkers(ctx context.Context, n int, records <-chan Record, save func(Record) error) {
	// CHANGE 2: Use a WaitGroup so StartWorkers blocks until every worker has returned, enabling the caller to enforce its shutdown deadline.
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			// CHANGE 1: Pass ctx into runWorker so each goroutine can observe cancellation.
			runWorker(ctx, records, save)
		}()
	}
	<-ctx.Done()
	log.Println("shutdown signal received")
	// CHANGE 2: Wait here so the caller knows all workers have exited before the process proceeds with teardown.
	wg.Wait()
}
```

## Explanation

### Issue 1: Workers never observe context cancellation

**Problem:** Every goroutine spawned by `StartWorkers` runs `for rec := range records`. Because the producer never closes the `records` channel, `range` blocks indefinitely. When the OS sends a shutdown signal and the context is cancelled, the goroutines have no way to see it — they stay parked on the channel receive. This is what profiling shows as dozens of goroutines stuck inside `runWorker` long after the main context is done.

**Fix:** `runWorker` gains a `ctx context.Context` parameter. The `for range` loop is replaced with a `for { select { ... } }` that races `ctx.Done()` against an incoming record from `records`. When the context is cancelled, the `<-ctx.Done()` case wins and the function returns.

**Explanation:** A `range` over a channel only terminates when the channel is closed. The problem statement explicitly says the channel is intentionally never closed, so `range` will never unblock on its own. A `select` with a `ctx.Done()` arm adds a second way to exit the loop. When the context is cancelled both cases may be ready simultaneously; Go picks one at random, so a worker might process one extra record before exiting — that is acceptable. If the channel were ever closed in a future refactor, the `ok` check on the `rec, ok := <-records` receive handles that path cleanly too.

---

### Issue 2: StartWorkers returns before workers finish, preventing a clean drain

**Problem:** After receiving `ctx.Done()`, the original `StartWorkers` logs the message and returns immediately. The caller has no handle on the worker goroutines, so it cannot tell when they have actually stopped. This means the surrounding shutdown sequence — which expects a 5-second deadline to be sufficient — cannot enforce it; the process either exits while goroutines are mid-write, or the OS is forced to kill it after 30+ seconds.

**Fix:** A `sync.WaitGroup` is added. Each goroutine calls `wg.Add(1)` before launch and `defer wg.Done()` inside the goroutine. `StartWorkers` calls `wg.Wait()` after the `ctx.Done()` receive, so it does not return until every worker has exited.

**Explanation:** Without `wg.Wait()`, the function that called `StartWorkers` resumes the moment the context is cancelled, tears down resources, and the process may exit. The worker goroutines are then either abruptly killed mid-write or — if the runtime keeps them alive — they accumulate. With `wg.Wait()`, `StartWorkers` blocks until all workers have returned from `runWorker`. Because Issue 1 is also fixed, each worker now exits promptly on cancellation, so the wait is bounded by the time to finish any single in-progress `save` call rather than hanging forever.
