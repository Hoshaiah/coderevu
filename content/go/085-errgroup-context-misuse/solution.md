## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Errgroup Context Used After Cancel
// ------------------------------------------------------------------------

package batch

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Record struct{ ID int }

func ProcessBatch(ctx context.Context, records []Record) error {
	g, _ := errgroup.WithContext(ctx)

	// CHANGE 1: Open the DB connection with the parent ctx, not gCtx, so that one worker's failure does not invalidate the shared connection for all other workers.
	conn, err := openDBConn(ctx)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer conn.Close()

	for _, rec := range records {
		rec := rec
		g.Go(func() error {
			// CHANGE 2: Pass the parent ctx to processRecord instead of gCtx, so that cancellation of the errgroup context does not abort sibling workers' database calls.
			return processRecord(ctx, conn, rec)
		})
	}
	return g.Wait()
}

func openDBConn(ctx context.Context) (*DBConn, error) { return &DBConn{}, nil }
func processRecord(ctx context.Context, conn *DBConn, rec Record) error {
	return conn.Exec(ctx, fmt.Sprintf("process %d", rec.ID))
}

type DBConn struct{}

func (c *DBConn) Exec(ctx context.Context, q string) error { return nil }
func (c *DBConn) Close()                                   {}
```

## Explanation

### Issue 1: Shared DB connection uses errgroup context

**Problem:** The DB connection is opened with `gCtx` (the errgroup-derived context). When any worker goroutine returns a non-nil error, `errgroup` cancels `gCtx`. The already-open `DBConn` is now holding a cancelled context, and any subsequent use of that connection observes `context.Canceled` even for records that have nothing to do with the original failure.

**Fix:** Replace `openDBConn(gCtx)` with `openDBConn(ctx)`, where `ctx` is the caller-supplied parent context. The connection is now unaffected by the errgroup's internal cancellation signal.

**Explanation:** `errgroup.WithContext` creates a child context that is cancelled as soon as the first non-nil error is returned from any goroutine. A resource opened under that child context inherits its lifetime; once the context is cancelled, drivers that respect context (most modern Go DB drivers do) will refuse new operations and may tear down existing ones. The fix anchors the connection to the parent context, whose lifetime is controlled by the caller, not by the errgroup. A related pitfall: if you use `database/sql`'s `*sql.Conn` (a single checked-out connection) instead of a pool, passing a cancelled context to any method on it will return an error immediately, so the same rule applies.

---

### Issue 2: Worker queries use errgroup context for execution

**Problem:** Each worker calls `processRecord(gCtx, conn, rec)`, which forwards `gCtx` to `conn.Exec`. The moment any worker fails and the errgroup cancels `gCtx`, every other worker's in-flight `Exec` call receives a cancellation signal and returns `context.Canceled`. Those workers then return that error to the errgroup, which logs them as failures and eventually causes the caller to retry the entire batch.

**Fix:** Change the goroutine closure to call `processRecord(ctx, conn, rec)` using the parent context rather than `gCtx`, so each worker's database call is governed by the caller's context, not the errgroup's cancellable child.

**Explanation:** The errgroup pattern is designed for "fail fast" fan-out: if one task fails, you usually want to stop the others. That is useful when tasks are producing results that feed a shared pipeline. Here the tasks are independent record processors, and stopping siblings on the first error is the wrong behavior — it converts a single-record failure into a full-batch failure. By giving each worker the parent context, you let them run to completion (or until the caller cancels), and only the record whose `processRecord` actually returned a non-nil error will be retried. Note that `gCtx` is no longer used after this change; the blank identifier `_` is used in place of `gCtx` in the `errgroup.WithContext` call to make the intent explicit and avoid a compiler error for an unused variable.
