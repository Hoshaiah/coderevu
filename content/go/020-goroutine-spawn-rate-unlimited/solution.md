## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Unbounded Goroutine Spawn Under Load
// ------------------------------------------------------------------------

package worker

import (
	"context"
	"log"
	"sync"
)

const maxConcurrency = 100 // CHANGE 1: cap concurrent goroutines to bound memory under load

type Task struct {
	ID      int
	Payload string
}

func Dispatch(ctx context.Context, tasks <-chan Task, callAPI func(context.Context, Task) error) {
	// CHANGE 1: semaphore channel limits live goroutines to maxConcurrency at any moment; callers block here instead of spawning freely.
	sem := make(chan struct{}, maxConcurrency)
	// CHANGE 2: WaitGroup tracks in-flight goroutines so we can drain them before returning.
	var wg sync.WaitGroup
	defer wg.Wait()

	for {
		select {
		case <-ctx.Done():
			return
		case task, ok := <-tasks:
			if !ok {
				return
			}
			// CHANGE 1: acquire a semaphore slot before spawning; this blocks the dispatch loop when maxConcurrency goroutines are already running.
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			wg.Add(1) // CHANGE 2: register the goroutine with the WaitGroup before launching it.
			go func(t Task) {
				defer wg.Done()       // CHANGE 2: signal completion so the deferred wg.Wait() can unblock after all goroutines finish.
				defer func() { <-sem }() // CHANGE 1: release the semaphore slot when the goroutine exits so the next task can proceed.
				if err := callAPI(ctx, t); err != nil {
					log.Printf("task %d failed: %v", t.ID, err)
				}
			}(task)
		}
	}
}
```

## Explanation

### Issue 1: Unbounded goroutine spawning under load

**Problem:** When the remote API responds slowly and tasks arrive faster than they complete, the dispatch loop spawns a new goroutine for every task without any limit. During a traffic spike the live goroutine count reaches millions; each holds an HTTP response buffer, exhausting the 512 MB container memory and triggering an OOM kill.

**Fix:** A buffered channel `sem` of size `maxConcurrency` (100) acts as a semaphore. Before spawning a goroutine, the dispatch loop must send into `sem` (`sem <- struct{}{}`). If 100 goroutines are already running the send blocks, pausing the loop. Inside each goroutine, `defer func() { <-sem }()` releases the slot on exit.

**Explanation:** The original code assumed the remote API's latency would bound parallelism. It does not — latency only determines how long each goroutine lives, not how many exist at once. If tasks arrive at 1 000/s and the API takes 10 s to respond, 10 000 goroutines pile up in steady state, each holding open TCP connections and read buffers. The semaphore makes concurrency a hard ceiling: the 101st task cannot start until one of the first 100 finishes. The `select` that acquires the semaphore also listens on `ctx.Done()` so the loop exits promptly on cancellation rather than blocking forever waiting for a free slot.

---

### Issue 2: In-flight goroutines not drained on shutdown

**Problem:** When `ctx` is cancelled or the `tasks` channel closes, `Dispatch` returns immediately. Any goroutines still running at that moment continue executing in the background — or are abruptly cut off if the process exits — which can cause partial writes, unclosed connections, or silently dropped results.

**Fix:** A `sync.WaitGroup` is added. `wg.Add(1)` is called before each goroutine launch, `defer wg.Done()` runs inside the goroutine, and `defer wg.Wait()` is placed at the top of `Dispatch` so the function blocks until all in-flight goroutines complete before it returns.

**Explanation:** Go does not automatically wait for goroutines when a function returns. Without `wg.Wait()`, the caller (or the process) can proceed — or exit — while goroutines are mid-flight, leaving work in an undefined state. The `defer wg.Wait()` placement is important: because `defer` runs LIFO, it fires after the loop exits but before the function's stack frame is torn down, giving all spawned goroutines a chance to finish. One related pitfall: `wg.Add(1)` must be called in the dispatch loop (not inside the goroutine) to avoid a race where `wg.Wait()` sees a zero count before the goroutine has had a chance to call `Add`.
