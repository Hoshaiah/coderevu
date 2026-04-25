## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — errgroup Wait Never Called
// ------------------------------------------------------------------------

package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Record struct{ ID int }

func RunStage(ctx context.Context, inputs []Record, process func(Record) (Record, error)) ([]Record, error) {
	g, gctx := errgroup.WithContext(ctx)
	results := make([]Record, len(inputs))

	for i, rec := range inputs {
		i, rec := i, rec
		g.Go(func() error {
			out, err := process(rec)
			if err != nil {
				return fmt.Errorf("record %d: %w", rec.ID, err)
			}
			results[i] = out
			return nil
		})
	}

	// CHANGE 1: call g.Wait() to block until all workers finish and collect any worker error; the original code skipped this entirely, letting the function return while goroutines were still running.
	// CHANGE 2: use the error returned by g.Wait() instead of gctx.Err(), so worker errors (not just context cancellation) are actually surfaced to the caller.
	if err := g.Wait(); err != nil {
		return nil, err
	}

	_ = gctx // gctx is still available if callers need to propagate cancellation into process(); kept to avoid import churn.
	return results, nil
}
```

## Explanation

### Issue 1: `g.Wait()` never called

**Problem:** The function spawns N goroutines via `g.Go` but never calls `g.Wait()`, so it returns immediately after the loop. Workers continue running in the background, writing into `results` while the next pipeline stage is already reading the same slice. This produces missing or partially-written records with no error logged, because nothing is waiting for the workers to finish.

**Fix:** Replace the `gctx.Err()` check with `g.Wait()` at CHANGE 1. `g.Wait()` blocks until every goroutine registered with `g.Go` has returned, then returns the first non-nil error any of them produced.

**Explanation:** `errgroup.Group.Go` registers a goroutine and increments an internal wait-group counter. `g.Wait()` is the only mechanism that decrements that counter and blocks the caller until the count reaches zero. Without calling it, the spawning goroutine (the one running `RunStage`) is free to return the moment the `for` loop exits, while the worker goroutines run independently. The next stage receives the `results` slice immediately and starts reading it, racing with writers. Because Go's memory model does not guarantee visibility of writes made by unsynchronized goroutines, some slots in `results` may appear as their zero values even after a worker has written them. Calling `g.Wait()` provides the synchronization barrier that makes all worker writes visible before `results` is returned.

---

### Issue 2: Worker errors silently dropped via `gctx.Err()`

**Problem:** The original code checks `gctx.Err()` to decide whether to return an error. `gctx` is a derived context that `errgroup` cancels only when a worker returns a non-nil error — but `gctx.Err()` is checked before the workers have finished (since `g.Wait()` is absent), and even if checked afterward, it only indicates that *some* error happened, not what it was. The actual error value from the worker is lost.

**Fix:** At CHANGE 2, the `gctx.Err()` check is replaced with `if err := g.Wait(); err != nil`. `g.Wait()` returns the first non-nil error returned by any goroutine registered with `g.Go`, preserving the full error value including the `fmt.Errorf` wrapping done inside the worker.

**Explanation:** When a worker returns an error, `errgroup` stores that error internally and cancels `gctx` to signal other workers to stop early. But `gctx.Err()` only returns `context.Canceled` — it does not carry the original worker error. Callers that rely on `gctx.Err()` therefore see a generic cancellation error at best, and nothing at all if the check happens before the context is cancelled (as it does here without `g.Wait()`). `g.Wait()` is the intended API: it both synchronizes completion and returns the stored worker error. A related pitfall is that only the *first* worker error is returned; if you need all errors, you must collect them manually inside the worker closures before returning a single combined error.
