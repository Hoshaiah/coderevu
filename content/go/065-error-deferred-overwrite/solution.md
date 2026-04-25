## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Deferred Error Overwrites Real Error
// ------------------------------------------------------------------------

package store

import (
	"context"
	"database/sql"
	"fmt"
)

func RunInTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) (err error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	defer func() {
		if err != nil {
			// CHANGE 1: removed `err = nil` — the rollback is a cleanup side-effect; the original error from fn must be preserved and returned to the caller.
			if rbErr := tx.Rollback(); rbErr != nil {
				// CHANGE 2: wrap both errors so the caller sees the domain error and the rollback failure, instead of silently dropping the rollback error.
				err = fmt.Errorf("%w (rollback: %v)", err, rbErr)
			}
			return
		}
		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit: %w", commitErr)
		}
	}()

	err = fn(tx)
	return
}
```

## Explanation

### Issue 1: Defer Silently Clears the Domain Error

**Problem:** When `fn` returns a non-nil error (e.g. `ErrInsufficientFunds`), the defer enters the `if err != nil` branch, rolls back, then executes `err = nil`. Because `err` is a named return value, that assignment replaces the real error. The caller receives `nil` and cannot distinguish success from failure.

**Fix:** Remove the line `err = nil` from the rollback branch entirely. The `CHANGE 1` site keeps the `tx.Rollback()` call but drops the assignment that was overwriting the named return.

**Explanation:** Named return values in Go are ordinary variables whose final value becomes the function's return. A `defer` that writes to `err` after the main body has already set it will overwrite whatever `fn` returned. The original author probably intended to signal "the rollback cleaned things up, so no error to report", but that logic is wrong: the caller needs to know that `fn` failed so it can handle the domain error. Rollback is a mechanical cleanup step, not a reason to suppress the original failure. A related pitfall is the reverse: forgetting to set `err` inside a defer when you do want to inject an error, which is why named returns and defers must be used deliberately together.

---

### Issue 2: Rollback Error Is Silently Dropped

**Problem:** `_ = tx.Rollback()` discards any error the rollback itself returns. If the database connection is broken, the rollback may fail, leaving the transaction in an ambiguous state. The caller has no way to detect this.

**Fix:** At `CHANGE 2`, capture the rollback error in `rbErr` and, when it is non-nil, wrap it together with the original `err` using `fmt.Errorf("%w (rollback: %v)", err, rbErr)`. This keeps the original error unwrappable via `errors.Is`/`errors.As` while surfacing the rollback failure as additional context.

**Explanation:** `tx.Rollback` can fail if the underlying connection is already closed or if the database rejects the command. Discarding that error means operators cannot distinguish a clean rollback from a failed one during incident investigation. Wrapping with `%w` on the original error preserves the error chain so that existing `errors.Is(err, ErrInsufficientFunds)` checks in callers continue to work, while the rollback detail appears in logs and error messages. One edge case to watch: `sql.ErrTxDone` is returned by `Rollback` when the transaction was already committed or rolled back, which is harmless; teams sometimes add an explicit check to ignore that specific sentinel.
