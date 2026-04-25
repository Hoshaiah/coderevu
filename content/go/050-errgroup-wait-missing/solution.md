## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — errgroup Wait Never Called
// ------------------------------------------------------------------------

package export

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Result struct {
	System string
	Count  int
}

func ExportAll(ctx context.Context, data []byte) ([]Result, error) {
	results := make([]Result, 3)

	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		n, err := exportToSystemA(gctx, data)
		if err != nil {
			return fmt.Errorf("system A: %w", err)
		}
		results[0] = Result{System: "A", Count: n}
		return nil
	})

	g.Go(func() error {
		n, err := exportToSystemB(gctx, data)
		if err != nil {
			return fmt.Errorf("system B: %w", err)
		}
		results[1] = Result{System: "B", Count: n}
		return nil
	})

	g.Go(func() error {
		n, err := exportToSystemC(gctx, data)
		if err != nil {
			return fmt.Errorf("system C: %w", err)
		}
		results[2] = Result{System: "C", Count: n}
		return nil
	})

	// CHANGE 1: Call g.Wait() to block until all goroutines finish before returning results; without this the function returned while goroutines were still running.
	// CHANGE 2: Capture and return the error from g.Wait() so that any export failure is surfaced to the caller instead of being silently dropped.
	if err := g.Wait(); err != nil {
		return nil, err
	}

	return results, nil
}

func exportToSystemA(ctx context.Context, data []byte) (int, error) { return len(data), nil }
func exportToSystemB(ctx context.Context, data []byte) (int, error) { return len(data), nil }
func exportToSystemC(ctx context.Context, data []byte) (int, error) { return len(data), nil }
```

## Explanation

### Issue 1: `g.Wait()` never called

**Problem:** Callers intermittently receive a slice of three zero-value `Result` structs even when all three export functions succeed. The results appear empty because the goroutines have not yet written their values by the time `ExportAll` returns.

**Fix:** Add `g.Wait()` before the `return` statement. This call blocks until every goroutine launched with `g.Go` has returned, guaranteeing that all writes to `results` are complete before the slice is handed back to the caller.

**Explanation:** `errgroup.Group.Go` launches each function as an independent goroutine and returns immediately — it does not wait for the goroutine to finish. Without a matching `g.Wait()`, `ExportAll` falls through to the `return results, nil` statement while the three goroutines are still executing (or scheduled but not yet run). The caller then reads `results` before any of the `results[0]`, `results[1]`, or `results[2]` assignments have happened. The behavior is non-deterministic: on a lightly loaded machine the goroutines may finish fast enough that the caller usually sees the values, but under any scheduling delay the slice is empty. `g.Wait()` is the synchronization barrier that closes this race.

---

### Issue 2: Export errors silently discarded

**Problem:** If any of the three export functions returns an error, the goroutine propagates it to the errgroup, but because `g.Wait()` was not called at all (Issue 1), and even after adding the call its return value was not checked, the caller always receives `nil` for the error — it has no way to know that an export failed.

**Fix:** Replace the bare `g.Wait()` call with `if err := g.Wait(); err != nil { return nil, err }`. This captures the first non-nil error that any goroutine returned and propagates it to the caller, and also returns `nil` for the results slice so the caller cannot accidentally use partial data.

**Explanation:** `errgroup.Group` collects the first error returned by any goroutine and stores it internally. That error is only accessible via the value returned by `g.Wait()`. Ignoring that return value (writing `g.Wait()` as a statement) compiles without warning but throws away failure information. A concrete case: if `exportToSystemB` fails because a downstream service is down, `results[1]` stays as its zero value, but the caller receives `(results, nil)` and may treat the zero `Count` as a legitimate export of zero records rather than a failure. Returning the error and `nil` results makes the failure unambiguous.
