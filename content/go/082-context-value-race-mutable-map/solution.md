## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Mutable Map Value in Context
// ------------------------------------------------------------------------

package middleware

import (
	"context"
	"net/http"
	"sync"
)

type contextKey string

const metaKey contextKey = "request-meta"

// safeMeta wraps a map with a mutex so concurrent handlers can read and write without data races.
type safeMeta struct {
	mu   sync.RWMutex
	data map[string]string
}

// CHANGE 1: get returns a copied value under a read lock, eliminating concurrent map-read vs map-write races.
func (s *safeMeta) get(key string) (string, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	v, ok := s.data[key]
	return v, ok
}

// CHANGE 2: set writes a key under a write lock so handler annotations never race with concurrent reads or writes.
func (s *safeMeta) set(key, value string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = value
}

// CHANGE 1: store a *safeMeta in the context instead of a raw map so the pointer is shared but access is serialised.
func InjectMeta(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		meta := &safeMeta{
			data: map[string]string{
				"request_id": r.Header.Get("X-Request-ID"),
				"region":     r.Header.Get("X-Region"),
			},
		}
		ctx := context.WithValue(r.Context(), metaKey, meta)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// CHANGE 1: GetMeta now returns *safeMeta instead of map[string]string, forcing callers through the mutex-protected get/set methods.
func GetMeta(ctx context.Context) *safeMeta {
	v := ctx.Value(metaKey)
	if v == nil {
		return nil
	}
	return v.(*safeMeta)
}
```

## Explanation

### Issue 1: Raw map shared across concurrent handlers

**Problem:** Every handler that calls `GetMeta` receives the exact same `map[string]string` pointer that was stored in the context by the middleware. When two handlers — running in separate goroutines — both access that map at the same time (one reading, one writing, or both writing), the Go runtime detects a data race and panics with `concurrent map read and map write`. Because HTTP handlers are always invoked concurrently, this panic is load-dependent and never appears in single-threaded tests.

**Fix:** Replace the raw `map[string]string` stored in the context with a `*safeMeta` struct (added in `CHANGE 1`). `safeMeta` embeds a `sync.RWMutex` and exposes `get` and `set` methods that lock before touching the inner map. `InjectMeta` now allocates a `*safeMeta`, and `GetMeta` returns `*safeMeta` instead of the bare map.

**Explanation:** The Go memory model guarantees nothing about concurrent map access; even two simultaneous reads alongside a write are undefined behaviour and trigger the runtime's map-concurrency detector. Wrapping the map in a struct with a `sync.RWMutex` serialises access: `get` acquires a read lock (`RLock`/`RUnlock`), so many readers can proceed in parallel, while `set` acquires the exclusive write lock (`Lock`/`Unlock`), blocking all other readers and writers until the write finishes. Storing the struct as a pointer (`*safeMeta`) in the context is important — if it were stored by value, `context.WithValue` would copy the struct, copying the mutex too, which is itself a race-prone mistake that `go vet` flags.

---

### Issue 2: No safe mutation API for downstream handler annotations

**Problem:** The original design gives callers a raw map and implicitly expects them to write into it to accumulate trace annotations. There is no mechanism to do that safely, so any handler that sets a key (e.g., `meta["span_id"] = ...`) immediately introduces a write that can race with any concurrent read from another handler on the same request.

**Fix:** `CHANGE 2` adds a `set(key, value string)` method on `safeMeta` that acquires `mu.Lock()` before writing and defers `mu.Unlock()`. Handlers call `meta.set("span_id", id)` instead of assigning directly into the map.

**Explanation:** Making mutation go through a method rather than direct map indexing means the mutex is always held during the write, regardless of which handler or goroutine calls it. The read path uses `sync.RWMutex`'s shared lock so multiple handlers reading different keys at the same moment do not block each other — only an active writer causes readers to wait. A related pitfall: if you had instead returned a copy of the whole map from `GetMeta`, handler writes would silently be lost (they'd mutate a local copy), so surfacing `get`/`set` methods on the shared pointer is the correct trade-off between safety and visible-mutation semantics.
