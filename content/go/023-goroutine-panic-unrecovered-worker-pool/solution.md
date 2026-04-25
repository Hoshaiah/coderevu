## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Panic Kills Entire Worker Pool
// ------------------------------------------------------------------------

package worker

import "log"

type Job struct {
	ID      string
	Payload []byte
}

type Pool struct {
	jobs chan Job
}

func NewPool(size int) *Pool {
	p := &Pool{jobs: make(chan Job, 64)}
	for i := 0; i < size; i++ {
		go p.run()
	}
	return p
}

func (p *Pool) Submit(j Job) {
	p.jobs <- j
}

func (p *Pool) run() {
	// CHANGE 2: Loop forever so that when a panic is recovered the worker re-enters the job loop instead of exiting, keeping pool size constant.
	for {
		p.runOnce()
	}
}

func (p *Pool) runOnce() {
	// CHANGE 1: Deferred recover() catches any panic from processJob (e.g. the NLP library) and logs it, preventing the goroutine — and the whole process — from crashing.
	defer func() {
		if r := recover(); r != nil {
			log.Printf("worker recovered from panic: %v", r)
		}
	}()
	for job := range p.jobs {
		if err := processJob(job); err != nil {
			log.Printf("job %s failed: %v", job.ID, err)
		}
	}
}

func processJob(j Job) error {
	// calls third-party NLP library that may panic
	_ = j.Payload
	return nil
}
```

## Explanation

### Issue 1: Unrecovered Panic Crashes Process

**Problem:** When the NLP library panics inside `processJob`, the panic unwinds the goroutine stack and, because nothing calls `recover()`, Go's runtime terminates the entire process. Every in-flight job across all workers is lost and the service requires a manual restart.

**Fix:** A `defer` block containing `recover()` is added at the top of the new `runOnce()` method. If `processJob` panics, `recover()` catches the value, logs it with `log.Printf("worker recovered from panic: %v", r)`, and the deferred function returns normally, unwinding only that single job's stack frame.

**Explanation:** In Go, a panic propagates up the call stack of the goroutine it originates in. If the panic reaches the top of the goroutine's stack without hitting a `recover()`, the runtime prints the stack trace and calls `os.Exit(2)`, killing every goroutine in the process. Placing `recover()` inside a `defer` intercepts the panic before it escapes the goroutine. Because `recover()` only works inside a `defer` that runs in the panicking goroutine, it must be deferred directly in the function that is the outermost frame you want to protect — here `runOnce`. A related pitfall: placing `recover()` in a helper called from a non-deferred function has no effect; it must be in a `defer`.

---

### Issue 2: Recovered Workers Exit and Shrink the Pool

**Problem:** Even after adding `recover()`, once the deferred function returns the goroutine running `run()` finishes and exits. Over time every worker that experiences a panic disappears from the pool. The pool silently shrinks to zero workers, and submitted jobs pile up in the buffered channel with nothing consuming them.

**Fix:** The original `run()` method is split into `run()` and `runOnce()`. `run()` contains an infinite `for {}` loop that calls `runOnce()` on each iteration. After a panic is recovered and `runOnce()` returns, `run()` immediately calls `runOnce()` again, keeping the goroutine alive and the pool at its intended size.

**Explanation:** A `defer`/`recover()` can only stop the panic from escaping the current function call; it cannot prevent that function from returning. Once `runOnce()` returns (whether normally via channel close or after a recovery), control goes back to the caller. Without the outer loop in `run()`, the goroutine would exit silently. Wrapping the call in `for { p.runOnce() }` means the goroutine re-enters `runOnce()` immediately, re-registering a fresh `defer` for the next job. A related pitfall: if the `jobs` channel is closed (e.g., during shutdown), `for job := range p.jobs` will exit and `runOnce()` returns without a panic, causing the outer loop to spin. For a long-lived pool that is never intentionally shut down this is harmless, but a production shutdown path should close the channel and add a check after `runOnce()` to break the outer loop.
