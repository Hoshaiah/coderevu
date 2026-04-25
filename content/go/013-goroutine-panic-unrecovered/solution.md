## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Panic in Goroutine Crashes Server
// ------------------------------------------------------------------------

package worker

import (
	"log"
	"sync"
)

type Job struct {
	ID  string
	Fn  func() error
}

type Dispatcher struct {
	wg sync.WaitGroup
}

func (d *Dispatcher) Submit(job Job) {
	d.wg.Add(1)
	go func() {
		// CHANGE 1: recover from any panic inside the job goroutine so a misbehaving Fn cannot crash the server process; wg.Done is already deferred above this point so it still runs on panic unwind.
		defer func() {
			if r := recover(); r != nil {
				log.Printf("job %s panicked: %v", job.ID, r)
			}
		}()
		// CHANGE 2: move wg.Done into its own earlier defer so it executes regardless of whether the inner recover defer exits normally or via panic, preventing a deadlock in Wait().
		defer d.wg.Done()
		if err := job.Fn(); err != nil {
			log.Printf("job %s failed: %v", job.ID, err)
		}
	}()
}

func (d *Dispatcher) Wait() {
	d.wg.Wait()
}
```

## Explanation

### Issue 1: Unrecovered panic kills server process

**Problem:** When `job.Fn()` panics, Go unwinds the goroutine's stack looking for a deferred `recover()`. The job goroutine has none, so the runtime prints the panic and terminates the entire process — taking down the HTTP server and every healthy goroutine with it.

**Fix:** A deferred anonymous function containing `recover()` is added at the top of the goroutine body (CHANGE 1). If `job.Fn()` panics, `recover()` catches the value, and `log.Printf` records `job %s panicked: %v` so the event is visible in logs without crashing anything.

**Explanation:** In Go, a panic can only be stopped by a `recover()` call that executes inside a deferred function *in the same goroutine*. A `recover()` in the main goroutine or any other goroutine has no effect on a panic in the job goroutine. By deferring the recovery at the start of the goroutine closure, the deferred function runs during stack unwinding and intercepts the panic before it reaches the runtime's top-level handler. After `recover()` returns the panic value, execution of that goroutine ends normally and the process continues. One pitfall: forgetting to log the recovered value makes the failure invisible, so the `log.Printf` call is essential for post-mortem diagnosis.

---

### Issue 2: Deferred wg.Done must run even on panic to prevent deadlock

**Problem:** If `wg.Done()` is deferred but the goroutine panics before recovering, the defer ordering matters. With the original single `defer d.wg.Done()`, placing the new recover-defer after it means the counter could be decremented before the panic is caught — which is actually fine — but the ordering must be deliberate and correct to guarantee `Wait()` never blocks forever.

**Fix:** `defer d.wg.Done()` is placed as a separate, earlier-registered defer (CHANGE 2), which means it executes *after* the recover defer in Go's LIFO order. This guarantees the counter is decremented on every exit path: normal return, error return, and panic.

**Explanation:** Go runs deferred calls in last-in, first-out order within a goroutine. The recover defer is registered first (outermost), so it runs last during unwinding — it catches the panic. The `wg.Done()` defer is registered second (innermost), so it runs first, decrementing the counter while the panic is still propagating upward to the recover defer. This ensures `d.wg.Wait()` in the main goroutine is never stuck waiting for a counter that will never reach zero. If `wg.Done()` were not deferred at all, or were placed inside the non-deferred code path, a panic would leave the `WaitGroup` counter permanently above zero and `Wait()` would deadlock.
