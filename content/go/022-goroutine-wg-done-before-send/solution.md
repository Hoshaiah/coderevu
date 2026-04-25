## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — WaitGroup Done Called Too Early
// ------------------------------------------------------------------------

package agg

import "sync"

type Result struct {
	WorkerID int
	Value    int
}

func Aggregate(workerCount int, work func(id int) int) []Result {
	results := make(chan Result, workerCount)
	var wg sync.WaitGroup

	wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		id := i
		go func() {
			// CHANGE 1: moved wg.Done() to after the send so the result is in the channel before we signal completion; previously Done fired first, allowing close(results) to race ahead of the send.
			defer wg.Done()
			v := work(id)
			results <- Result{WorkerID: id, Value: v}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var out []Result
	for r := range results {
		out = append(out, r)
	}
	return out
}
```

## Explanation

### Issue 1: `wg.Done` Called Before Result Sent

**Problem:** Workers call `wg.Done()` as their very first statement, before computing the value or sending to the channel. When the last worker calls `wg.Done()`, `wg.Wait()` unblocks, `close(results)` executes, and the `for range` loop on `results` exits — even though one or more workers haven't sent their `Result` yet. Those results are dropped silently.

**Fix:** Replace the explicit `wg.Done()` call at the top of the goroutine body with `defer wg.Done()` placed before the work and send. `defer` ensures `Done` runs only after `results <- Result{...}` completes.

**Explanation:** The `WaitGroup` counter is meant to track "work fully finished," including the side-effects (sending to the channel). By calling `Done` first, the counter no longer measures that. Consider the single-worker case: the goroutine calls `Done`, the closer goroutine sees the count reach zero and calls `close(results)`, the main goroutine's `for range` drains the (still empty) buffered channel and returns an empty slice — all before the worker even calls `work(id)`. Using `defer wg.Done()` after the send statement enforces the correct ordering: send happens, then `Done` fires, then `Wait` can return, then `close` is safe. A related pitfall is putting `defer wg.Done()` before the send but after some early-return error path — always verify every exit path from the goroutine happens after the channel write.

---
