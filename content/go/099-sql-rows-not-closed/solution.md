## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Database connection pool exhausted because rows are never closed
// ------------------------------------------------------------------------
package reports

import (
	"context"
	"database/sql"
	"fmt"
)

type Order struct {
	ID     int64
	Amount float64
}

func FetchOrders(ctx context.Context, db *sql.DB, userID int64) ([]Order, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, amount FROM orders WHERE user_id = $1", userID)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	// CHANGE 1: defer rows.Close() immediately after a successful QueryContext so the connection is returned to the pool no matter how the function exits — normal return, scan error, or context cancellation.
	defer rows.Close()

	var orders []Order
	for rows.Next() {
		var o Order
		// CHANGE 2: the early return on scan error is now safe because the deferred rows.Close() above will still execute, releasing the connection instead of leaving it pinned open.
		if err := rows.Scan(&o.ID, &o.Amount); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}
	return orders, nil
}
```

## Explanation

### Issue 1: `rows.Close()` never called, pool exhausted

**Problem:** Every call to `FetchOrders` opens a `*sql.Rows` object that holds a live database connection. Because `rows.Close()` is never called, the connection is never returned to the `database/sql` pool. Under sustained traffic the pool fills up, new callers block waiting for a free connection, and eventually the context deadline fires, producing `context deadline exceeded` errors.

**Fix:** Add `defer rows.Close()` immediately after the `err` check on `db.QueryContext`. This is the single line added at CHANGE 1 in the reference solution.

**Explanation:** `database/sql` manages a bounded pool of physical connections. When `QueryContext` succeeds it hands ownership of one connection to the returned `*sql.Rows`. The connection stays checked out until `rows.Close()` is called — iterating to the end of the result set with `rows.Next()` does *not* automatically close the rows or return the connection. Using `defer` guarantees the call happens regardless of which code path exits the function. A related pitfall: if you forget to call `rows.Close()` in a loop that calls `FetchOrders` repeatedly (e.g., building a dashboard from many queries), the leak rate multiplies by the loop count, making the pool exhaustion happen even faster.

---

### Issue 2: Early return on scan error bypasses cleanup

**Problem:** When `rows.Scan` fails the function returns immediately, skipping any subsequent cleanup code. Without a `defer`, the `*sql.Rows` object is abandoned with the connection still open. The caller receives the scan error but the pool loses a connection permanently for that goroutine's lifetime.

**Fix:** The fix at CHANGE 2 is not a change to the return statement itself — it is the `defer rows.Close()` added at CHANGE 1 that makes the existing early return safe. The CHANGE 2 comment clarifies why the early return is now correct.

**Explanation:** Before the fix, both exit paths from the loop — a successful completion and a scan error — left rows open, but the scan-error path was the harder one to notice because it looked like the function was "done" with the rows. `defer` evaluates when the enclosing function returns, so it covers every return site, including panics. This is exactly why `defer` is the idiomatic pattern for `rows.Close()` in Go: you add it once right after acquisition and never have to think about individual exit paths again. A related pitfall is forgetting that `rows.Next()` itself can return `false` due to an error, which is why checking `rows.Err()` after the loop is also necessary — but that check was already present in the original code.
