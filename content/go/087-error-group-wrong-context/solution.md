## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Cancelled Context Passed to Workers
// ------------------------------------------------------------------------

package batch

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func ProcessBatch(ctx context.Context, records []string) error {
	var lastErr error

	for attempt := 0; attempt < 3; attempt++ {
		// CHANGE 1+2: Create a fresh errgroup (and its derived context) on every attempt so the context from a previous failure cannot leak into the next retry.
		eg, egCtx := errgroup.WithContext(ctx)

		for _, r := range records {
			rec := r
			eg.Go(func() error {
				return process(egCtx, rec)
			})
		}
		lastErr = eg.Wait()
		if lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("all attempts failed: %w", lastErr)
}

func process(ctx context.Context, rec string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	_ = rec
	return nil
}
```

## Explanation

### Issue 1: Cancelled context reused across retry attempts

**Problem:** On the first attempt, if any worker returns an error, `errgroup` cancels `egCtx`. On the second and third retry attempts, every worker starts with that already-cancelled `egCtx`, hits the `ctx.Err() != nil` check immediately, and returns `context canceled` without doing any real work. Logs show `context canceled` on every task in every retry after the first.

**Fix:** Move `eg, egCtx := errgroup.WithContext(ctx)` inside the `for attempt` loop (the `// CHANGE 1+2` line), so each attempt gets a brand-new context derived from the still-valid root `ctx`.

**Explanation:** `errgroup.WithContext` creates a child context and internally wires a `cancel` function that fires when the first goroutine returns a non-nil error or when `Wait` returns. Once that cancel fires, the child context is permanently done — there is no way to reset it. Because the original code created `egCtx` once before the loop, every subsequent retry inherits a context that was cancelled during attempt 1. Moving the construction inside the loop gives each attempt its own independent child context derived from the caller-supplied `ctx`, which is confirmed non-cancelled. A related pitfall: if the caller's `ctx` itself gets cancelled between retries (e.g., an HTTP request times out), the fresh child context will also be cancelled immediately, which is the correct and desired behavior.

---

### Issue 2: errgroup reused after Wait

**Problem:** The `errgroup.Group` is constructed once and `eg.Wait()` is called on it up to three times. The `errgroup` package does not document or support calling `Wait` more than once on the same group, and adding goroutines via `eg.Go` after `Wait` has already returned races with the group's internal counter.

**Fix:** The same move inside the loop (the `// CHANGE 1+2` site) allocates a new `errgroup.Group` for each attempt, so `eg.Go` and `eg.Wait` are always used on a freshly initialized group with no prior state.

**Explanation:** `errgroup.Group` uses an internal `sync.WaitGroup` and an `once`-guarded error field. After `Wait` drains the `sync.WaitGroup` to zero, calling `eg.Go` increments the counter again and a subsequent `Wait` call may return before those goroutines finish if internal state is not cleanly reset. In practice this produces data races on the stored error and non-deterministic behavior where some goroutines' errors are silently dropped. Creating a new group per attempt avoids all of this: each group sees exactly the goroutines launched for that attempt, and `Wait` is called exactly once per group.
