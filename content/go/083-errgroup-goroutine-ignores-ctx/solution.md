## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Ignores errgroup Context
// ------------------------------------------------------------------------

package ingest

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func ProcessRecords(ctx context.Context, records []string, store func(string) error) error {
	g, gCtx := errgroup.WithContext(ctx)
	// CHANGE 2: removed `_ = gCtx` — discarding gCtx made cancellation unreachable by any goroutine.

	for _, rec := range records {
		rec := rec
		g.Go(func() error {
			// Long-running work that should respect cancellation
			for i := 0; i < 10; i++ {
				// CHANGE 1: check gCtx.Err() before each store call so the goroutine exits when any sibling fails.
				if err := gCtx.Err(); err != nil {
					return fmt.Errorf("context cancelled before store %q: %w", rec, err)
				}
				if err := store(rec); err != nil {
					return fmt.Errorf("store %q: %w", rec, err)
				}
			}
			return nil
		})
	}

	return g.Wait()
}
```

## Explanation

### Issue 1: Goroutine never checks context cancellation

**Problem:** When `store` fails in one goroutine, `errgroup` cancels `gCtx`, but every other running goroutine keeps looping through all ten `store` calls regardless. Operators see the job running at full CPU and network load for the entire 30-minute timeout even though the first error was logged almost immediately.

**Fix:** Add `if err := gCtx.Err(); err != nil { return ... }` at the top of the inner `for` loop, before each `store` call. This is the `CHANGE 1` site.

**Explanation:** `errgroup.WithContext` cancels `gCtx` the moment the first goroutine returns a non-nil error. However, cancellation is cooperative in Go — a goroutine must explicitly check the context to notice it. Without the `gCtx.Err()` check, each goroutine blocks on `store(rec)` for a full network timeout, then retries up to nine more times, completely unaware that the group has already failed. Adding the check at the top of each iteration lets a goroutine bail out within microseconds of sibling failure. A related pitfall: if `store` itself accepted a `context.Context`, you could pass `gCtx` into it and let the network layer cancel the in-flight request too, which is even faster than waiting for the current `store` call to return.

---

### Issue 2: Derived context discarded with blank identifier

**Problem:** The line `_ = gCtx` throws away the only variable that carries the cancellation signal from `errgroup`. Even if a developer later tries to use `gCtx` inside a goroutine, the blank-identifier assignment before the loop makes the intent explicit that `gCtx` is intentionally unused, and any linter or reviewer would treat it as deliberate.

**Fix:** Remove the `_ = gCtx` line entirely. This is the `CHANGE 2` site. After removal, `gCtx` is a live variable used inside the goroutine closure.

**Explanation:** Go requires all declared variables to be used, so the original author silenced the compiler error with `_ = gCtx` instead of actually threading the context into the worker. This is a common workaround that accidentally documents intent to ignore cancellation. Removing it forces the variable to be used somewhere — in this case inside the goroutine loop — which is what `errgroup.WithContext` was designed for. If you leave `_ = gCtx` in place, no amount of checking inside the goroutine will compile correctly because `gCtx` would appear unused to the compiler only if no other reference existed; in practice the blank assignment doesn't shadow the variable, so removing it is purely a correctness-and-clarity improvement.
