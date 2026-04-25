## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — WaitGroup Done Before Result Written
// ------------------------------------------------------------------------

package pipeline

import "sync"

type PriceResult struct {
	Source string
	Price  float64
}

func FetchFirst(sources []string, fetch func(string) (PriceResult, error)) PriceResult {
	var (
		mu     sync.Mutex
		wg     sync.WaitGroup
		result PriceResult
	)

	for _, src := range sources {
		wg.Add(1)
		go func(s string) {
			// CHANGE 2: defer wg.Done() so it always fires after the mutex is fully released, never before the write completes.
			defer wg.Done()
			r, err := fetch(s)
			if err == nil {
				mu.Lock()
				// CHANGE 1: moved result.Price comparison inside the lock so the read and write of result are both protected, eliminating the data race.
				if r.Price > result.Price {
					result = r
				}
				mu.Unlock()
			}
		}(src)
	}

	wg.Wait()
	return result
}
```

## Explanation

### Issue 1: Unprotected read of `result.Price`

**Problem:** Each goroutine reads `result.Price` outside the mutex to decide whether its own result is better. When multiple goroutines run concurrently, one goroutine can be writing `result` under the lock while another reads `result.Price` without the lock, producing a data race. The race detector flags this, and the CPU can observe a partially-written or stale value, causing the caller to receive a zero-price result even though a goroutine successfully fetched a non-zero price.

**Fix:** The comparison `r.Price > result.Price` is moved inside the `mu.Lock()` / `mu.Unlock()` block, directly above `result = r`. Both the read of `result.Price` and the write of `result` are now protected by the same mutex.

**Explanation:** A mutex only protects the memory it guards for the duration it is held. Reading `result.Price` before acquiring `mu` means no synchronization exists between that read and any concurrent write in another goroutine — this is the textbook definition of a data race. The Go memory model does not guarantee that a racing read sees any particular value; in practice the CPU may reorder stores, and the compiler may cache values in registers. Moving the read inside the lock ensures that whichever goroutine holds `mu` sees a consistent snapshot of `result`. A related pitfall: even a single-field read like `result.Price` is not atomic on all architectures, so a partial write (e.g., only the high 32 bits updated) can be observed without a lock.

---

### Issue 2: `wg.Done()` called before write is guaranteed complete

**Problem:** In the original code, `wg.Done()` is called after `mu.Unlock()`, but only in the success branch — if the `if err == nil && r.Price > result.Price` condition is false the `wg.Done()` still runs, but the ordering of `wg.Done()` relative to the unlock is fragile and easy to break during future edits. More critically, if a panic or early return were added, `Done` could be skipped entirely, hanging the caller forever on `wg.Wait()`.

**Fix:** `wg.Done()` is replaced with `defer wg.Done()` at the top of the goroutine body, before any conditional logic. This guarantees `Done` is called exactly once when the goroutine exits, regardless of which code path ran.

**Explanation:** `defer` registers the call to run when the enclosing function returns, which happens after all other statements in the function complete — including any `mu.Unlock()` call. This means the `WaitGroup` counter is decremented only after the goroutine's work is fully done and all locks are released. Without `defer`, adding an early `return` or additional error path in future code could silently skip `wg.Done()`, causing `wg.Wait()` in the caller to block forever. Using `defer` is the idiomatic Go pattern precisely because it is robust to control-flow changes.
