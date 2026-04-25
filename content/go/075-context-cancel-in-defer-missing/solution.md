## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Cancel Never Called
// ------------------------------------------------------------------------

package store

import (
	"context"
	"database/sql"
	"time"
)

type Product struct {
	ID   int
	Name string
}

func LookupProduct(ctx context.Context, db *sql.DB, id int) (*Product, error) {
	// CHANGE 1: capture the cancel func and defer it so the timeout context is always cleaned up, releasing the internal timer goroutine and context resources.
	qCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	row := db.QueryRowContext(qCtx, "SELECT id, name FROM products WHERE id = $1", id)

	var p Product
	if err := row.Scan(&p.ID, &p.Name); err != nil {
		return nil, err
	}
	return &p, nil
}
```

## Explanation

### Issue 1: Cancel Function Discarded, Timer Goroutine Leaks

**Problem:** Under sustained load, the process accumulates goroutines and memory grows steadily. `pprof` shows goroutines piling up inside the context package. Every call to `LookupProduct` adds to the leak even though the SQL query itself finishes quickly.

**Fix:** Assign the second return value of `context.WithTimeout` to `cancel` and immediately `defer cancel()` on the next line. The original code used `_` for the cancel function, so it was silently dropped.

**Explanation:** `context.WithTimeout` spawns an internal timer that fires after the deadline and cancels the context. To clean up that timer (and the goroutine backing it), the caller must invoke the returned `CancelFunc`. When the cancel function is discarded with `_`, nothing ever calls it. The timer goroutine stays alive until the parent context is cancelled — which, for a long-lived server context, may be never. Each request that calls `LookupProduct` leaks one timer goroutine and the associated context node. At thousands of calls per second the accumulation is rapid. Calling `defer cancel()` right after `context.WithTimeout` ensures cleanup happens as soon as `LookupProduct` returns, regardless of whether it returns an error or a result. The Go documentation explicitly states: "Failing to call the CancelFunc leaks the child and its children until the parent is canceled or the timer fires."

---

### Issue 2: go vet / staticcheck Catches Blank-Identifier Cancel Discard

**Problem:** The code compiles without warnings from the Go compiler, so the bug is invisible during normal builds. However, `go vet` (via the `lostcancel` analyzer) and staticcheck both flag the blank-identifier discard of a context cancel function as an error, meaning CI pipelines with these tools enabled would surface the problem before production.

**Fix:** The same `cancel` variable introduced in CHANGE 1 satisfies the `lostcancel` analyzer because the cancel function is now stored in a named variable and called via `defer cancel()`.

**Explanation:** The `lostcancel` analyzer is bundled with `go vet` and is run automatically by `go test`. It tracks the cancel function returned by `context.WithTimeout` and `context.WithCancel` and reports an error if the function is never called on some code path. Discarding it with `_` is the most direct way to trigger this diagnostic because there is no variable to track at all. If the team's CI runs `go vet ./...`, this would be reported as `the cancel function returned by context.WithTimeout should be called, not discarded, to avoid a context leak`. Enabling staticcheck adds a redundant but independent check under `SA1019` / `SA4006`. Adding `defer cancel()` makes both analyzers happy with zero additional logic.
