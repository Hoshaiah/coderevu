## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — errgroup Wait Error Ignored
// ------------------------------------------------------------------------

package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func RunBatch(ctx context.Context, items []string, process func(string) error) error {
	g, ctx := errgroup.WithContext(ctx)

	for _, item := range items {
		item := item
		g.Go(func() error {
			if err := process(item); err != nil {
				return fmt.Errorf("process %q: %w", item, err)
			}
			return nil
		})
	}

	// CHANGE 1: return the error from g.Wait() instead of discarding it; any worker error now propagates to the caller.
	// CHANGE 2: removed the nolint:errcheck directive that was hiding the ignored-return-value problem from static analysis.
	return g.Wait()
}
```

## Explanation

### Issue 1: `g.Wait()` Return Value Discarded

**Problem:** `g.Wait()` returns the first non-nil error from any goroutine launched with `g.Go`, but the original code throws that value away and always returns `nil`. The HTTP handler therefore sees a success, downstream services receive incomplete or malformed output, and no alert fires even though individual workers logged failures.

**Fix:** Replace the two-statement `g.Wait(); return nil` with a single `return g.Wait()` at the CHANGE 1 site, so the caller receives whatever error `errgroup` collected.

**Explanation:** `errgroup.Group.Wait` blocks until every goroutine finishes, then returns the first error it saw (subsequent errors are dropped, which is documented behavior). When the refactor moved from a manual `sync.WaitGroup` to `errgroup`, the author kept the old pattern of calling `Wait()` for its blocking side-effect and returning a separate `nil`, not realizing that `errgroup.Wait` also carries the error. Because Go does not force you to use a return value, the compiler raises no complaint, and the program compiles and runs without any sign of the problem. One related pitfall: even after this fix, only the first error is returned; if you need all errors, you must collect them yourself inside the goroutines.

---

### Issue 2: `nolint:errcheck` Suppressing the Warning

**Problem:** The `// nolint:errcheck` comment tells the `errcheck` linter to skip the `g.Wait()` call, so the tool that exists specifically to catch ignored errors is told to look away. Any CI pipeline running `errcheck` or `golangci-lint` would have flagged this line immediately, but the directive prevents that signal from reaching the team.

**Fix:** Remove the `// nolint:errcheck` comment entirely at the CHANGE 2 site. After CHANGE 1 the return value is no longer ignored, so the directive is both incorrect and unnecessary.

**Explanation:** `nolint` directives are sometimes legitimate (e.g., when a library documents that a particular return value is safe to ignore), but they should be used with a specific, documented reason. Here the directive was added without justification, almost certainly because a linter warned about the ignored `Wait()` result during the refactor and someone silenced the warning rather than fixing the root cause. Removing it restores the linter as a safety net so future regressions in the same pattern are caught before they reach production.
