## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Default Case Causes Busy-Spin
// ------------------------------------------------------------------------

package main

import (
	"log"
	"time"
)

type Job struct{ ID int }

func worker(jobs <-chan Job, quit <-chan struct{}) {
	// CHANGE 2: add a ticker so bookkeeping runs on a controlled interval instead of at spin rate.
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		// CHANGE 1: remove the default case so the select blocks efficiently when no job or quit signal is ready; add ticker.C to handle periodic bookkeeping without spinning.
		select {
		case j, ok := <-jobs:
			if !ok {
				return
			}
			process(j)
		case <-quit:
			return
		case <-ticker.C:
			doBookkeeping()
		}
	}
}

func process(j Job) { log.Printf("processing %d", j.ID) }
func doBookkeeping()  { /* lightweight check */ }
func main()           {}
```

## Explanation

### Issue 1: `default` Case Causes Busy-Spin

**Problem:** When the `jobs` channel has no items and no quit signal has arrived, the `select` immediately falls through to `default` on every iteration. The loop runs at full CPU speed — millions of iterations per second — pinning one core at 100% even though the worker has nothing meaningful to do.

**Fix:** Remove the `default` case entirely and add a `case <-ticker.C` branch (introduced in CHANGE 1 and CHANGE 2) so the `select` blocks until a job arrives, a quit is signalled, or the ticker fires.

**Explanation:** A `select` with a `default` case is non-blocking by definition: if none of the channel cases are ready, Go skips them all and runs `default` immediately. Without `default`, `select` parks the goroutine in the runtime scheduler until at least one channel becomes ready, consuming no CPU while waiting. The developer's `time.Sleep(1ms)` workaround reduced spin rate but introduced artificial latency on every job because the goroutine might be sleeping exactly when a job arrives. Using a ticker as a proper channel case gives the scheduler a real event to wait on, so the goroutine wakes instantly when a job appears and also runs bookkeeping on a predictable cadence.

---

### Issue 2: Bookkeeping Has No Controlled Schedule

**Problem:** With the `default` branch, `doBookkeeping` is called at whatever rate the CPU allows — potentially millions of times per second — rather than at the periodic interval the developer intended. This makes bookkeeping behavior unpredictable and wastes cycles even if each individual call is lightweight.

**Fix:** A `time.NewTicker(5 * time.Second)` is created before the loop (CHANGE 2), and its channel `ticker.C` is used as an explicit `select` case so `doBookkeeping` runs exactly once per tick interval.

**Explanation:** The original intent was clearly periodic bookkeeping ("do bookkeeping between jobs"), but `default` provides no timing guarantee whatsoever. A `time.Ticker` generates one value on its channel per interval, so adding `case <-ticker.C: doBookkeeping()` means the function runs at most once per tick regardless of job throughput. `ticker.Stop()` is deferred immediately after creation to release the underlying timer resources when the worker exits — omitting `Stop` would leave the ticker's goroutine running and leak memory if workers are created and destroyed repeatedly.
