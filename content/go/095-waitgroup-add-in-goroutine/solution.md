## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — WaitGroup Add called inside goroutine causes Wait to return too early
// ------------------------------------------------------------------------
package etl

import (
	"sync"
)

type Record struct{ Value int }

func Process(records []Record, handle func(Record)) {
	var wg sync.WaitGroup
	for _, rec := range records {
		rec := rec
		// CHANGE 1: wg.Add(1) moved here, before the goroutine is launched, so the counter is incremented while we are still on the spawning goroutine — guaranteeing Wait cannot return before every worker has been counted.
		wg.Add(1)
		go func() {
			defer wg.Done()
			handle(rec)
		}()
	}
	wg.Wait()
}

func WriteSummary() { /* write aggregate counts */ }
```

## Explanation

### Issue 1: `wg.Add` called inside goroutine races with `wg.Wait`

**Problem:** The ETL pipeline occasionally writes the summary record before all workers finish. In staging this shows up as aggregate counts that are too low, because `wg.Wait()` returns while some goroutines are still running `handle(rec)`.

**Fix:** Move `wg.Add(1)` to the line immediately before the `go func()` launch, outside the goroutine body, and remove it from inside the goroutine. The `defer wg.Done()` stays inside the goroutine unchanged.

**Explanation:** `sync.WaitGroup` works by keeping an internal counter. `Wait` blocks until that counter reaches zero. If the counter is already zero when `Wait` is called — even momentarily — `Wait` returns immediately. When `Add` is inside the goroutine, there is a window between the `go` statement and the moment the new goroutine actually runs and calls `Add`. If the scheduler lets the spawning loop finish and reach `Wait` before any goroutine has called `Add`, the counter is still zero and `Wait` returns right away. This race is timing-dependent: under a debugger or heavy load the scheduler pauses differ, so the bug disappears or appears inconsistently. Calling `Add` on the spawning goroutine before the `go` statement closes that window entirely — the counter is already incremented before `Wait` can even be reached.

---
