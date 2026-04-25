## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Producer Close Races Multiple Senders
// ------------------------------------------------------------------------

package ingest

import (
	"context"
	"sync"
)

type Record struct {
	ID   int
	Data string
}

func fetchPage(ctx context.Context, page int) ([]Record, error) {
	return nil, nil
}

func Collect(ctx context.Context, pages int) <-chan Record {
	results := make(chan Record, 64)
	var wg sync.WaitGroup

	for i := 0; i < pages; i++ {
		wg.Add(1)
		go func(page int) {
			// CHANGE 2: defer wg.Done() so the WaitGroup is decremented when this goroutine exits, with no wait or close inside the worker.
			defer wg.Done()
			records, err := fetchPage(ctx, page)
			if err == nil {
				for _, r := range records {
					results <- r
				}
			}
			// CHANGE 1: removed wg.Done(), wg.Wait(), and close(results) from inside the goroutine — each worker was closing the channel independently, racing with sibling workers still sending.
		}(i)
	}

	// CHANGE 1: close results in a single dedicated goroutine after wg.Wait() returns, ensuring exactly one close happens after all workers finish.
	go func() {
		wg.Wait()
		close(results)
	}()

	return results
}
```

## Explanation

### Issue 1: Multiple goroutines each close the shared channel

**Problem:** Every worker goroutine calls `close(results)` after its local `wg.Wait()` returns. When two workers finish near-simultaneously, both observe the WaitGroup counter drop to zero and both attempt to close the already-closed channel. The second close panics with `close of closed channel`, and any worker that has not yet sent its last record panics with `send on closed channel`.

**Fix:** Remove `wg.Wait()` and `close(results)` from inside every worker goroutine entirely. A single, dedicated goroutine is started after the loop — it calls `wg.Wait()` once and then calls `close(results)` exactly one time.

**Explanation:** A `sync.WaitGroup` counter reaching zero is not a one-time event that only one goroutine sees; every goroutine blocked in `wg.Wait()` unblocks simultaneously when the count hits zero. So N workers all sleeping in `wg.Wait()` all wake up at the same instant and all try to close the same channel. Moving the single `wg.Wait() + close` into one background goroutine means only one goroutine ever executes that close, eliminating the race entirely. A related pitfall: starting that dedicated goroutine after the loop is safe because `wg.Add(1)` is already called for every worker before the goroutine is launched, so the count is never prematurely zero.

---

### Issue 2: wg.Done called before wg.Wait inside the same goroutine

**Problem:** The original code calls `wg.Done()` and then immediately `wg.Wait()` inside the same worker goroutine. A worker decrements the counter and then waits for it to reach zero — which is redundant at best and fragile at worst, because the worker's own `Done` could be the one that triggers the `Wait` to return, causing that goroutine to be the one that closes the channel while sibling goroutines are still in their send loops.

**Fix:** Replace the explicit `wg.Done()` call with `defer wg.Done()` at the top of the goroutine body, and remove `wg.Wait()` and `close(results)` from the goroutine entirely (as described in Issue 1).

**Explanation:** Using `defer wg.Done()` guarantees the decrement happens when the goroutine function returns, even if a panic or early return occurs. Placing `Done` before `Wait` in the original code means the decrement and the wait-check happen in the same goroutine sequentially, which is redundant — the worker is both signalling completion and then checking whether everything is complete. The correct pattern is: workers only signal (`Done`), and one separate controller waits and then does cleanup (`Wait` + `close`). Deferring `Done` also prevents a subtle bug where an early `return` inside the send loop would skip the `Done` call and deadlock the WaitGroup forever.
