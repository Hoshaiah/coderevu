## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Panic Crashes Entire HTTP Server
// ------------------------------------------------------------------------

package export

import (
	"fmt"
	"log"
	"time"
)

type ExportJob struct {
	UserID   int
	Format   string
	FilePath string
}

func StartExport(job ExportJob) {
	go func() {
		// CHANGE 1: Defer a recover() so that any panic inside this goroutine is caught locally and logged instead of crashing the process.
		defer func() {
			if r := recover(); r != nil {
				log.Printf("export panicked for user %d: %v", job.UserID, r)
			}
		}()
		if err := runExport(job); err != nil {
			log.Printf("export failed for user %d: %v", job.UserID, err)
		}
	}()
}

// CHANGE 2: Return an error so callers can propagate or record the failure rather than silently swallowing it.
func runExport(job ExportJob) error {
	time.Sleep(2 * time.Second) // simulate work
	// third-party lib may panic on malformed input
	if job.Format == "" {
		return fmt.Errorf("missing format for user %d", job.UserID)
	}
	return nil
}
```

## Explanation

### Issue 1: Goroutine panic kills entire process

**Problem:** Operators see the service crash once a day with a nil pointer dereference originating inside `runExport`. The HTTP middleware's `recover()` never catches it because that deferred recover lives on the HTTP handler's goroutine stack, not on the goroutine spawned by `StartExport`.

**Fix:** A `defer`/`recover()` block is added at the very top of the anonymous goroutine in `StartExport` (the `// CHANGE 1` site). When a panic propagates up through `runExport`, this deferred function intercepts it, logs the details, and lets the goroutine exit cleanly without touching the rest of the process.

**Explanation:** In Go, each goroutine has its own independent call stack. A `recover()` only catches panics that unwind through the same stack it was deferred on. When `StartExport` calls `go func()`, a brand-new stack is created; the HTTP handler's deferred recover on its own stack has no visibility into that new stack. If the panic is not recovered on the child goroutine's own stack, the Go runtime treats it as unhandled and terminates the whole program. Placing `defer recover()` as the first statement inside the goroutine literal guarantees it is always present on that goroutine's stack before any other code runs. A related pitfall: if you move the `defer` outside the `go` keyword (i.e., before the goroutine is launched), it runs on the parent's stack and still does not protect the child.

---

### Issue 2: StartExport provides no error signal to callers

**Problem:** `StartExport` returns nothing, so if `runExport` returns an error the only record is a log line. Higher-level code (the HTTP handler, a job scheduler, a retry system) cannot tell that the export failed and cannot take corrective action.

**Fix:** `runExport` is updated at the `// CHANGE 2` site to return a concrete `error` value (using `fmt.Errorf`) for invalid input, demonstrating how the error path is exercised. The `StartExport` goroutine already passes that error to `log.Printf`, so the logging path remains intact.

**Explanation:** A function that runs background work and discards its error return makes failures invisible to automated systems. If an operator only has logs, a missed log rotation or log shipper outage means the failure goes completely unnoticed. Returning a real `error` from `runExport` keeps the door open for callers to store the result in a database, push a metric, or trigger a retry without requiring a log-scraping side channel. In this code the goroutine logs the error, which is acceptable for a fire-and-forget job, but the important structural point is that `runExport` itself should always surface failures as `error` values rather than silently returning `nil` on bad input.
