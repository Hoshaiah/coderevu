## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Mutex Never Unlocked on Error
// ------------------------------------------------------------------------

package cache

import (
	"encoding/json"
	"errors"
	"sync"
)

type LRUCache struct {
	mu    sync.Mutex
	store map[string][]byte
}

func NewLRUCache() *LRUCache {
	return &LRUCache{store: make(map[string][]byte)}
}

func (c *LRUCache) Set(key string, value any) error {
	data, err := serialize(value)
	if err != nil {
		return errors.New("serialize failed: " + err.Error())
	}

	c.mu.Lock()
	// CHANGE 2: use defer to guarantee the mutex is released on every return path, removing reliance on manual Unlock calls.
	defer c.mu.Unlock()
	if len(c.store) > 10000 {
		// CHANGE 1: removed the manual c.mu.Unlock() call here; the deferred Unlock above handles this path, fixing the deadlock when the cache is full.
		return errors.New("cache full")
	}
	c.store[key] = data
	// CHANGE 2 (continued): removed the manual c.mu.Unlock() before the return; defer handles it.
	return nil
}

func serialize(v any) ([]byte, error) {
	return json.Marshal(v)
}

func (c *LRUCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.store[key]
	return v, ok
}
```

## Explanation

### Issue 1: Mutex not unlocked on capacity-exceeded path

**Problem:** When `len(c.store) > 10000`, the original code calls `c.mu.Unlock()` and returns. This looks correct in isolation, but the buggy version shown has no `Unlock` call on that branch — the lock is held when `return errors.New("cache full")` executes. Every subsequent call to `Set` or `Get` blocks forever trying to acquire the mutex, which is exactly the deadlock described: goroutines pile up, the service stops responding, and only a restart clears it.

**Fix:** The manual `c.mu.Unlock()` inside the capacity-exceeded `if` block is removed and replaced by a single `defer c.mu.Unlock()` placed immediately after `c.mu.Lock()`. The deferred call fires on every return, including the early `return errors.New("cache full")` path.

**Explanation:** Go's `sync.Mutex` has no timeout and no re-entrancy. Once a goroutine holds the lock and returns without releasing it, the mutex stays locked forever — Go does not release it when the goroutine exits or when the function returns. Any goroutine that then calls `c.mu.Lock()` blocks indefinitely. Because `Get` also acquires the same mutex, even read-only callers deadlock. The `defer` pattern is the standard remedy: it binds the unlock to the function's return regardless of which code path is taken, so no branch can accidentally skip it. A related pitfall is holding a mutex across a long-running or blocking operation (like a network call); here `serialize` is called before `Lock`, which correctly keeps the critical section short.

---

### Issue 2: Manual unlock calls create fragile code prone to future omissions

**Problem:** The original code uses two explicit `c.mu.Unlock()` calls — one inside the capacity check and one before the final `return nil`. Any future maintainer adding a new early-return (e.g., a validation check) can easily forget to add a matching `Unlock`, recreating the deadlock silently.

**Fix:** Both manual `c.mu.Unlock()` calls are removed. A single `defer c.mu.Unlock()` is added on the line immediately after `c.mu.Lock()`. This mirrors the pattern already used in `Get` and is idiomatic Go.

**Explanation:** `defer` in Go executes the deferred call when the surrounding function returns, in LIFO order if multiple defers exist. Placing `defer c.mu.Unlock()` right after `c.mu.Lock()` means the unlock is unconditionally registered before any branching logic runs. This removes the need for every code path to remember to call `Unlock`. The cost is negligible — a deferred call has a small overhead, but for a mutex-guarded map operation that overhead is irrelevant. The concrete risk of manual unlocking is exactly what produced issue 1: one missing call is enough to freeze the entire service.
