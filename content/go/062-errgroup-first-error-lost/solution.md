## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — First Error Lost Before Wait
// ------------------------------------------------------------------------

package jobs

import (
	"context"
	"fmt"
	"golang.org/x/sync/errgroup"
)

type Step func(ctx context.Context) error

func RunTransforms(ctx context.Context, steps []Step) error {
	g, gctx := errgroup.WithContext(ctx)

	for _, step := range steps {
		s := step
		g.Go(func() error {
			return s(gctx)
		})
	}

	// CHANGE 1: capture the error from g.Wait() into a local variable so we can return it instead of always returning nil.
	err := g.Wait()
	if err != nil {
		fmt.Printf("transform error: %v\n", err)
	}
	// CHANGE 2: return err (which may be nil or non-nil) so the caller receives the actual step failure instead of a hardcoded nil.
	return err
}
```

## Explanation

### Issue 1: Error discarded, function always returns nil

**Problem:** `RunTransforms` calls `g.Wait()` and checks whether the returned error is non-nil, but then unconditionally executes `return nil`. The scheduler calling `RunTransforms` always receives `nil`, so it believes every job run succeeded even when a transformation step fails.

**Fix:** Replace the inline `if err := g.Wait(); err != nil { … }` block with `err := g.Wait()` assigned to a named variable, then `return err` at the end of the function instead of `return nil`.

**Explanation:** `errgroup.Wait` blocks until all goroutines finish and returns the first non-nil error any of them produced. The original code placed the `g.Wait()` result in a short-variable-declaration scoped to the `if` block, checked it for logging, and then fell through to `return nil`. Because Go's `if` short-variable-declaration scope does not extend past the closing brace, the error never reached the function's return statement. Assigning the result to `err` before the `if` and then returning `err` directly ensures the error travels back to the caller. A related pitfall: if you ever restructure the logging to be optional (e.g., behind a flag), forgetting to move the assignment out of the `if` condition would reintroduce the same bug.

---

### Issue 2: Logging substituted for propagation

**Problem:** The only action taken on the step error is a `fmt.Printf` call. From the operator's perspective the job logs show the error message, but the scheduler's return-value check sees `nil` and marks the job as healthy, allowing corrupted output to proceed to downstream consumers.

**Fix:** Keep the `fmt.Printf` for observability, but after the `if` block use `return err` (from CHANGE 2) so both logging and propagation happen together.

**Explanation:** Logging and returning an error are independent responsibilities. Logging tells humans something went wrong; returning the error tells the calling code something went wrong. The original author likely intended both, but the `return nil` statement at the end made the log message the only observable effect inside the process. The scheduler's error-handling path was never triggered because it depends on the return value, not on stdout. Keeping the `fmt.Printf` alongside `return err` means operators still get an immediate log line, and the scheduler also gets the non-nil error it needs to halt the pipeline and alert.
