## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Mutable Pointer Stored in Context
// ------------------------------------------------------------------------

package middleware

import (
	"context"
	"net/http"
	"sync"
)

type contextKey struct{}

type RequestMeta struct {
	UserID  string
	TraceID string
	Flags   map[string]bool
	mu      sync.RWMutex
}

func (m *RequestMeta) SetFlag(key string, val bool) {
	// CHANGE 2: upgraded from sync.Mutex to sync.RWMutex; Lock() still used for writes so concurrent reads via RLock are not blocked unnecessarily.
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Flags[key] = val
}

func (m *RequestMeta) GetFlag(key string) bool {
	// CHANGE 1: acquire RLock before reading the map so concurrent SetFlag calls cannot race with this read.
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.Flags[key]
}

func Inject(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		meta := &RequestMeta{
			Flags: make(map[string]bool),
		}
		ctx := context.WithValue(r.Context(), contextKey{}, meta)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func MetaFromContext(ctx context.Context) *RequestMeta {
	m, _ := ctx.Value(contextKey{}).(*RequestMeta)
	return m
}
```

## Explanation

### Issue 1: Unguarded map read in `GetFlag`

**Problem:** A handler goroutine calls `SetFlag` (which locks the mutex) while a concurrent audit goroutine calls `GetFlag` (which holds no lock). The Go race detector flags this as a data race on the `m.Flags` map, and in practice the audit goroutine can observe a partially-written map entry or trigger a runtime panic from concurrent map access.

**Fix:** Add `m.mu.RLock()` / `m.mu.RUnlock()` at the top of `GetFlag` (the `// CHANGE 1` site), mirroring the lock discipline already present in `SetFlag`.

**Explanation:** Go's built-in map type is not safe for concurrent use; even a single simultaneous read and write can corrupt internal map state and cause a runtime fault. Holding a lock in the writer alone is not enough — the reader must also participate in the same locking protocol, otherwise the mutual-exclusion contract is broken. Using `sync.RWMutex` rather than `sync.Mutex` lets multiple audit goroutines read flags simultaneously without blocking each other, while still serialising any write. A related pitfall is ranging over `m.Flags` in a future helper without a lock — that iteration would have the same race and must also hold at least `RLock`.

---

### Issue 2: Wrong mutex type (`sync.Mutex` instead of `sync.RWMutex`)

**Problem:** The original code uses `sync.Mutex` for both read and write paths. Once `GetFlag` is fixed to lock, every read blocks every other concurrent read, which is unnecessarily restrictive when multiple audit goroutines want to read flags at the same time.

**Fix:** Replace the `mu sync.Mutex` field declaration with `mu sync.RWMutex` (the `// CHANGE 2` site). `SetFlag` continues to call `mu.Lock()` / `mu.Unlock()` for exclusive write access; `GetFlag` now calls `mu.RLock()` / `mu.RUnlock()` for shared read access.

**Explanation:** `sync.RWMutex` distinguishes between readers and writers: many goroutines can hold `RLock` simultaneously, but `Lock` blocks until all readers release and then excludes new readers until the write is done. In this codebase audit goroutines are read-heavy, so the `RWMutex` avoids serialising them against each other. Had `sync.Mutex` been kept, `GetFlag` calls from several concurrent audit goroutines would queue up unnecessarily, adding latency under load. The correctness guarantee is identical to a plain `Mutex`; the difference is purely performance when reads dominate.
