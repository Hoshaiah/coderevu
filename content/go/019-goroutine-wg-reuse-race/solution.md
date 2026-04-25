## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — WaitGroup Reused Before Done
// ------------------------------------------------------------------------

package batch

import "sync"

type Processor struct {
	wg      sync.WaitGroup
	workers int
	semCh   chan struct{}
}

func NewProcessor(workers int) *Processor {
	return &Processor{
		workers: workers,
		semCh:   make(chan struct{}, workers),
	}
}

func (p *Processor) Submit(task func()) {
	// CHANGE 1: acquire the semaphore slot BEFORE calling wg.Add so that if Flush/Wait is still running for the previous batch, this Add cannot race with that Wait; the caller blocks here until a slot is free, guaranteeing Add only happens after the previous Wait has fully returned.
	p.semCh <- struct{}{}
	p.wg.Add(1)
	go func() {
		defer func() {
			<-p.semCh
			p.wg.Done()
		}()
		task()
	}()
}

func (p *Processor) Flush() {
	p.wg.Wait()
}
```

## Explanation

### Issue 1: Add Races With Prior Wait

**Problem:** The staging environment sporadically panics with `sync: WaitGroup is reused before previous Wait has returned`. This happens non-deterministically under CPU pressure when batches are submitted back-to-back.

**Fix:** Move `p.semCh <- struct{}{}` to execute *before* `p.wg.Add(1)` at the CHANGE 1 site. The semaphore send now acts as the gate: `Add` is only reached after a worker slot is obtained.

**Explanation:** The Go runtime requires that once `Wait` begins, no new `Add` calls with a positive delta may occur until `Wait` returns. In the buggy code, `Submit` calls `wg.Add(1)` immediately, then blocks on the semaphore channel. When a large batch finishes and `Flush` calls `wg.Wait`, the counter can reach zero and `Wait` starts to return. At the same instant, the *next* batch's first `Submit` call — which has already passed `wg.Add(1)` — increments the counter again before `Wait` fully returns, violating the invariant. Swapping the order means the goroutine cannot increment the counter until it holds a semaphore slot. Because all goroutines from the previous batch release their slots only after calling `wg.Done`, and `Wait` returns only after all `Done` calls, a new `Add` cannot happen while `Wait` is still unwinding. A related pitfall: if you ever call `Flush` from a goroutine that also calls `Submit`, you need an external lock to prevent concurrent `Flush` calls; the semaphore fix alone does not protect against two concurrent flushes.

---

### Issue 2: Panicking Task Leaves Processor State Undefined

**Problem:** If `task()` panics inside the goroutine, the deferred `wg.Done` and semaphore release still execute (because `defer` runs during panic unwinding), but the panic itself is not recovered. It propagates up through the goroutine's stack, crashes the entire process, and the processor cannot be reused.

**Fix:** The minimal safe change is to add a `recover()` inside the goroutine's deferred function so that a panicking task does not crash the process. The reference solution keeps the structure minimal and does not add recovery, but the issue is called out here because the ETL pipeline's "undefined state" symptom is rooted in this omission.

**Explanation:** Go goroutines that panic and are not recovered terminate the whole program. The `defer` in `Submit`'s goroutine does run `wg.Done` and `<-p.semCh` before the crash, so the WaitGroup and semaphore stay consistent up to the point of the panic — but the process dies anyway. For a reusable processor where tasks can fail, wrapping `task()` in a `recover()` and storing the error (e.g., in a collected slice protected by a mutex) lets `Flush` return the errors to the caller instead of crashing. Without this, any single bad record in a 500-item batch takes down the entire ETL job.
