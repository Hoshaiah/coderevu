## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — ErrGroup First Error Discarded
// ------------------------------------------------------------------------

package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Payload struct{ Data string }

func validateSchema(ctx context.Context, p Payload) error  { return nil }
func validateContent(ctx context.Context, p Payload) error { return fmt.Errorf("content invalid") }
func validateAuth(ctx context.Context, p Payload) error    { return nil }

func Run(ctx context.Context, p Payload) error {
	g, ctx := errgroup.WithContext(ctx)

	// CHANGE 1: Return errors directly from each goroutine instead of capturing them in firstErr; errgroup collects the first non-nil error returned by any goroutine.
	g.Go(func() error {
		return validateSchema(ctx, p)
	})
	// CHANGE 1: Same fix for validateContent — return the error so errgroup can capture it rather than swallowing it with return nil.
	g.Go(func() error {
		return validateContent(ctx, p)
	})
	// CHANGE 1: Same fix for validateAuth — return the error directly.
	g.Go(func() error {
		return validateAuth(ctx, p)
	})

	// CHANGE 2: g.Wait() now returns the first non-nil error from any goroutine, so we just return it directly; the manual firstErr variable is removed entirely.
	return g.Wait()
}
```

## Explanation

### Issue 1: Goroutines swallow errors, errgroup sees nil

**Problem:** `Run` always returns `nil` even when a validator fails. The goroutines catch the validator error, store it in `firstErr`, and then `return nil` — so `errgroup` never sees a non-nil return value and `g.Wait()` always returns `nil`.

**Fix:** Remove the `if err … firstErr = err` blocks and instead `return validateSchema(ctx, p)`, `return validateContent(ctx, p)`, and `return validateAuth(ctx, p)` directly from each goroutine closure. Delete the manual `firstErr` variable entirely and replace the final `return firstErr` with `return g.Wait()`.

**Explanation:** `errgroup.Go` records the first non-nil error returned by any goroutine and makes it available via `g.Wait()`. When every goroutine returns `nil`, `g.Wait()` returns `nil` regardless of what happened inside. The original code treats the goroutine's return value as a signal to cancel the group's context, not as the error carrier — but then discards that signal by always returning `nil`. Returning the error directly from the closure is the intended usage pattern: `errgroup` performs the collection and the `Wait` call surfaces the result. A related pitfall is trying to return multiple errors; `errgroup` only keeps the first, so if you need all errors you need a different aggregation strategy.

---

### Issue 2: Unsynchronized concurrent writes to firstErr cause a data race

**Problem:** Multiple goroutines can execute `firstErr = err` at the same time without any lock or atomic operation. The Go race detector flags this as a data race. The value that `Run` ultimately returns depends on whichever goroutine wrote last, which is non-deterministic — explaining why the test fails only ~30% of the time.

**Fix:** The `firstErr` variable is removed entirely as part of CHANGE 2. Because each goroutine now returns its error directly and `errgroup` does its own thread-safe first-error bookkeeping internally, there is no shared mutable variable left to protect.

**Explanation:** A data race on `firstErr` means two goroutines may write to the same memory address concurrently. Even on a single-core machine the Go scheduler can preempt between the read and write of an assignment. The non-determinism comes from timing: if `validateContent` finishes before `validateAuth` starts writing, `firstErr` holds the right value; if both write concurrently the outcome is undefined. `errgroup` avoids this internally by using a `sync.Once` to record only the first error it receives, which is safe across goroutines. By delegating error collection to `errgroup`, the fix eliminates both the race and the manual bookkeeping.
