## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Concurrent Writes to Shared Slice Index
// ------------------------------------------------------------------------

package transform

import "sync"

type Item struct {
	ID    int
	Value float64
}

func ParallelMap(items []Item, fn func(Item) Item) []Item {
	results := make([]Item, len(items))
	var wg sync.WaitGroup
	for i := range items {
		wg.Add(1)
		// CHANGE 1: pass `i` as a parameter so each goroutine captures its own copy of the index, not the shared loop variable.
		go func(idx int) {
			defer wg.Done()
			// CHANGE 2: use `idx` (the local parameter) instead of `i` for both the read and the write, eliminating the data race and index confusion.
			results[idx] = fn(items[idx])
		}(i)
	}
	wg.Wait()
	return results
}
```

## Explanation

### Issue 1: Loop variable captured by reference

**Problem:** Every goroutine launched in the loop closes over the same `i` variable from the enclosing `for` scope. By the time a goroutine actually executes, the loop may have incremented `i` several times, so multiple goroutines end up using the same index. The race detector flags this because goroutines read `i` concurrently while the loop goroutine writes it.

**Fix:** At CHANGE 1, the anonymous function signature is changed from `func()` to `func(idx int)`, and the loop variable `i` is passed as the argument `(i)` at the call site. This gives each goroutine its own immutable copy of the index.

**Explanation:** In Go, a `for` loop reuses a single variable `i` across every iteration. A goroutine launched inside the loop body holds a reference (a pointer, effectively) to that variable, not a snapshot of its value at launch time. When the scheduler runs two goroutines after the loop has already reached index 5, both see `i == 5` and write to `results[5]`, leaving other slots untouched (zero-valued) and slot 5 potentially overwritten. Passing `i` as a function argument creates a new stack variable `idx` scoped to that goroutine invocation, so its value is fixed at launch. A related pitfall: using `i := i` (shadowing) inside the loop body also works, but passing it as a parameter is more explicit and harder to accidentally remove during refactoring.

---

### Issue 2: Goroutine body reads and writes via the wrong index

**Problem:** Inside the goroutine, `results[i]` and `items[i]` both dereference the shared loop variable. Even ignoring scheduling, two goroutines that happen to see the same value of `i` will both read from and write to the identical slice positions, corrupting output and leaving other positions as zero-valued `Item{}` structs.

**Fix:** At CHANGE 2, `i` is replaced with `idx` (the parameter introduced in CHANGE 1) in both the read `items[idx]` and the write `results[idx]`. Each goroutine now operates on exactly the element it was assigned.

**Explanation:** The slice `results` is pre-allocated with the correct length, so concurrent writes to *different* indices are safe in Go — each index is an independent memory location and no goroutine resizes the slice. The problem is not the slice itself but which index each goroutine targets. With the shared `i`, two goroutines might both write to `results[3]`; whichever runs last wins, and `results[7]` (for example) is never written and remains the zero value. Switching to `idx` ensures a strict 1-to-1 mapping: goroutine launched at loop iteration `k` reads `items[k]` and writes `results[k]`, regardless of when it is scheduled.
