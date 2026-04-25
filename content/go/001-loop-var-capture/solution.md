## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutines all print the same final value
// ------------------------------------------------------------------------
package worker

import (
	"log"
	"sync"
)

type Job struct {
	ID   int
	Body string
}

func Dispatch(jobs []Job) {
	var wg sync.WaitGroup
	for _, job := range jobs {
		wg.Add(1)
		// CHANGE 1: pass `job` as a function argument so its value is copied at the moment the goroutine is launched, not when the goroutine runs.
		go func(j Job) {
			defer wg.Done()
			log.Printf("processing job %d", j.ID)
			process(j)
		}(job) // CHANGE 1: `job` evaluated here, once per iteration
	}
	wg.Wait()
}

func process(j Job) { /* ... */ }
```

## Explanation

### Issue 1: Loop variable captured by reference in goroutine

**Problem:** Every goroutine launched inside the loop closes over the same `job` variable — the loop iteration variable. By the time any goroutine actually executes, the loop has usually finished, so `job` holds the value from the last iteration. All goroutines log and process that final job.

**Fix:** Change the goroutine literal from `func()` to `func(j Job)` and invoke it immediately with `(job)` as the argument (`go func(j Job) { ... }(job)`). This evaluates `job` once per iteration and copies its value into the parameter `j` before the goroutine starts.

**Explanation:** In Go 1.21 and earlier, the `for _, job := range jobs` loop reuses a single `job` variable across all iterations; its address never changes. A closure that references `job` directly holds a pointer to that one variable. Goroutines are scheduled concurrently, so most of them run after the loop has advanced `job` to its last value. Passing `job` as a function argument forces the Go runtime to evaluate the expression and copy the `Job` struct at the call site, which happens on the current goroutine before the new goroutine is scheduled. Each goroutine then works with its own independent copy `j`. Go 1.22 changed the spec so each iteration gets its own loop variable, but since the team is on 1.21, the argument-passing pattern is the correct portable fix.

---
