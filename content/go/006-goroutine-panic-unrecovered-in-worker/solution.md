## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Worker Panic Crashes Entire Server
// ------------------------------------------------------------------------

package worker

import (
	"log"
)

type Job struct {
	ID      int
	Payload []byte
}

func processJob(j Job) error {
	// may panic on malformed input
	_ = j.Payload[0]
	return nil
}

type Pool struct {
	jobs chan Job
}

func NewPool(size int) *Pool {
	p := &Pool{jobs: make(chan Job, 64)}
	for i := 0; i < size; i++ {
		// CHANGE 2: launch each worker via a named helper so the recover-and-restart loop is self-contained and the pool size stays constant even after a panic.
		go p.runWorker()
	}
	return p
}

// CHANGE 2: runWorker wraps the job loop so it can restart itself if a panic escapes processJob, keeping the worker count stable.
func (p *Pool) runWorker() {
	for {
		// CHANGE 1: defer a recovery inside each iteration wrapper so a panic in processJob is caught, logged, and the worker continues rather than crashing the process.
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("worker recovered from panic: %v", r)
				}
			}()
			for j := range p.jobs {
				if err := processJob(j); err != nil {
					log.Printf("job %d failed: %v", j.ID, err)
				}
			}
		}()
		// If we reach here the jobs channel was closed; exit the worker.
		break
	}
}

func (p *Pool) Submit(j Job) {
	p.jobs <- j
}
```

## Explanation

### Issue 1: No panic recovery in worker goroutine

**Problem:** When `processJob` panics (e.g., index out of range on an empty `Payload`), the panic unwinds the entire goroutine stack with no `recover` in the way. Go's runtime then terminates the process and prints the stack trace operators are seeing.

**Fix:** An anonymous function wrapping the inner `for j := range p.jobs` loop is added inside `runWorker`. It has a `defer func() { recover() }()` that catches any panic, logs it via `log.Printf`, and returns normally — letting the outer loop restart the inner one.

**Explanation:** In Go, a `recover` call only stops a panic if it is executed directly inside a deferred function that runs in the same goroutine as the panic. A `defer` placed in `NewPool`'s goroutine closure would work, but only once — after the first panic the goroutine exits. Wrapping the job-processing logic in a closure that defers a recovery means every job batch gets its own recovery scope. When `processJob` panics, the deferred function runs, `recover()` returns the panic value, the anonymous function returns, and the outer loop in `runWorker` can call the anonymous function again for the next job. Without this, one malformed payload kills the server.

---

### Issue 2: Panicking goroutine permanently leaves the pool

**Problem:** Even if recovery were added naively with a single `defer` at the top of the goroutine closure in `NewPool`, the goroutine would exit after recovering once (the `for range` loop ends when the function returns). Each subsequent panic shrinks the pool, and eventually no goroutines are left to process jobs — the service silently stalls.

**Fix:** The goroutine body is moved into a named method `runWorker` that contains an outer `for` loop. The anonymous closure with the `defer recover()` sits inside that loop. After a panic is recovered and the closure returns, the outer `for` restarts it immediately. The loop only `break`s when the inner `range` exits cleanly (i.e., `p.jobs` is closed).

**Explanation:** A `defer` in Go runs when its enclosing function returns, not when the goroutine's top-level function returns. By nesting the recovery inside an inner function called from an infinite loop, each call to that inner function gets a fresh `defer`. A panic causes the inner function to return (via `recover`), the outer loop iterates, and a new inner-function call starts — effectively restarting the worker. The pool size therefore stays exactly `size` goroutines throughout the lifetime of the process. A related pitfall: if you placed the `defer recover()` at the top of the goroutine function itself without the restart loop, the worker goroutine would exit after one panic and never be replaced.
