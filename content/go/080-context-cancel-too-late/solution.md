## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Cancelled After Work Done
// ------------------------------------------------------------------------

package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

var db interface {
	ExecContext(ctx context.Context, query string, args ...any) (any, error)
}
var storage interface {
	Put(ctx context.Context, key string, r io.Reader) error
}

func UploadHandler(w http.ResponseWriter, r *http.Request) {
	// CHANGE 2: Derive the timeout context from context.Background() instead of r.Context() so the DB write is not cancelled when the HTTP response finishes and r.Context() is cancelled by the net/http server.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	key := r.URL.Query().Get("key")
	if err := storage.Put(ctx, key, r.Body); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}

	if err := writeMetadata(ctx, key); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func writeMetadata(ctx context.Context, key string) error {
	_, err := db.ExecContext(ctx, "INSERT INTO uploads(key) VALUES($1)", key)
	// CHANGE 1: Only wrap and return the error when it is non-nil; previously fmt.Errorf always produced a non-nil error even on success, making every successful insert look like a failure.
	if err != nil {
		return fmt.Errorf("insert: %w", err)
	}
	return nil
}
```

## Explanation

### Issue 1: `fmt.Errorf` wraps nil, always returns error

**Problem:** Every call to `writeMetadata` returns a non-nil error, even when the `INSERT` succeeds. The handler therefore always takes the error branch, writes an HTTP 500, and the upload is reported as failed to the client even though the data was stored correctly.

**Fix:** Wrap `err` inside `fmt.Errorf` only when `err != nil`, and return `nil` on the happy path. The original single-line `return fmt.Errorf("insert: %w", err)` is replaced with an `if err != nil` guard that returns the wrapped error, followed by `return nil`.

**Explanation:** `fmt.Errorf` always returns a value that satisfies the `error` interface — even when the format argument `%w` receives a `nil` error, the returned `*fmt.wrapError` struct is not nil. So `writeMetadata` never returned `nil`, and the caller always entered the error branch. The fix is the standard Go idiom: check the raw error first, wrap only when it is non-nil. A related pitfall is doing the same thing with `errors.Wrap` from `github.com/pkg/errors`, which has the same behaviour when given a nil argument.

---

### Issue 2: Handler context cancelled before DB write completes

**Problem:** Operators see Postgres connections exhausted and `pprof` shows goroutines blocked in `db.ExecContext`. The context passed to the DB call is already cancelled at the point of the call, so every attempt to acquire or use a connection is immediately rejected, and the connections are left in a broken state that the pool must clean up.

**Fix:** Change `context.WithTimeout(r.Context(), 30*time.Second)` to `context.WithTimeout(context.Background(), 30*time.Second)`. This decouples the request-scoped context from the DB operation's lifetime.

**Explanation:** The Go `net/http` server cancels `r.Context()` as soon as the handler returns or the response is fully written. When the client receives the response headers (e.g. the 100-continue acknowledgement during upload), or when `w.WriteHeader` is called, the underlying request context can be cancelled. Any context derived from `r.Context()` is then also cancelled. By the time `writeMetadata` is called — or sometimes mid-call — the context deadline triggers, and `ExecContext` returns immediately with a context error rather than completing the insert. Because the connections were mid-transaction when cancelled, the pool spends extra cycles rolling back and re-validating them, which exhausts the pool under load. Using `context.Background()` as the root gives the 30-second timeout full effect independent of the HTTP lifecycle. The trade-off is that you lose automatic cancellation if the client disconnects before the upload is stored; for this handler that is acceptable because the storage write has already succeeded by the time the DB write runs.
