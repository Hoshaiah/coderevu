## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Recover Outside Panicking Goroutine
// ------------------------------------------------------------------------

package jobs

import (
	"log"
	"sync"
)

type Job struct {
	Name string
	Run  func()
}

func safeRun(job Job) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("recovered panic in job %s: %v", job.Name, r)
		}
	}()
	job.Run()
}

func Dispatch(jobs []Job) {
	var wg sync.WaitGroup
	for _, job := range jobs {
		wg.Add(1)
		go func(j Job) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("dispatcher recovered: %v", r)
				}
			}()
			// CHANGE 1: removed the extra `go` keyword so safeRun runs in this goroutine, where deferred recover() can catch its panics, and wg.Done() only fires after the job completes.
			safeRun(j)
		}(job)
	}
	wg.Wait()
}
```

## Explanation

### Issue 1: `recover` cannot catch panics across goroutine boundaries

**Problem:** The service crashes with an unhandled `panic: runtime error: index out of range` even though recovery logic is present. The crash originates inside a job goroutine and produces no recovery stack frame, meaning no `recover()` ever ran in that goroutine.

**Fix:** Remove the `go` keyword from `go safeRun(j)` so the call becomes a plain `safeRun(j)`. This makes `safeRun` — and its deferred `recover()` — execute in the same goroutine as the dispatcher's own deferred recover.

**Explanation:** In Go, `recover()` only intercepts a panic that occurs in the same goroutine where the deferred function lives. When the code writes `go safeRun(j)`, it starts a brand-new goroutine. The `defer recover()` blocks in the outer goroutine have no effect on panics in this new goroutine. When the new goroutine panics, the Go runtime finds no recovery point in its call stack and terminates the entire process. The bug is invisible in unit tests that call `safeRun` directly because those tests never add the extra `go` keyword. Removing `go` keeps `safeRun` on the same goroutine stack as the enclosing deferred functions, so both the `safeRun`-level recover and the dispatcher-level recover can catch any panic.

---

### Issue 2: `wg.Wait()` returns before jobs complete, causing premature process exit

**Problem:** With `go safeRun(j)` present, the goroutine spawned by `Dispatch` calls `wg.Done()` the moment it fires off `go safeRun(j)` — immediately, before the job has done any work. `wg.Wait()` therefore unblocks while jobs are still running, and if the main program exits after `Dispatch` returns, in-flight jobs are silently killed.

**Fix:** The same single-line change — replacing `go safeRun(j)` with `safeRun(j)` — makes the goroutine block until the job finishes before `defer wg.Done()` runs, so `wg.Wait()` correctly waits for all jobs.

**Explanation:** `sync.WaitGroup` tracks goroutines by counting `Add` and `Done` calls. If `wg.Done()` fires before the job's work is complete, the counter reaches zero too early and `Wait` unblocks. Any caller that uses `Dispatch` to ensure all background work is done before moving on (or before the process exits) will proceed with jobs still mid-flight. The fix is a consequence of issue 1's fix: once `safeRun` runs synchronously in the dispatched goroutine, `defer wg.Done()` at the top of that goroutine fires only after `safeRun` returns, which is only after the job's `Run` function returns or panics and is recovered.
