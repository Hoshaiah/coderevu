## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Mutex copied by value silently stops protecting shared state
// ------------------------------------------------------------------------
package cache

import (
	"sync"
)

type Cache struct {
	mu    sync.Mutex
	store map[string]string
}

// CHANGE 2: Return a pointer so callers cannot accidentally copy the Cache (and its embedded mutex) via a plain assignment.
func NewCache() *Cache {
	return &Cache{store: make(map[string]string)}
}

// CHANGE 1: Use a pointer receiver so Lock/Unlock operate on the same mutex instance that owns the map, not on a per-call copy.
func (c *Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store[key] = value
}

// CHANGE 1: Same pointer-receiver fix for Get.
func (c *Cache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.store[key]
	return v, ok
}
```

## Explanation

### Issue 1: Value receivers copy the mutex

**Problem:** Every call to `Set` or `Get` receives a fresh copy of the `Cache` struct, including its `sync.Mutex` field. Each goroutine therefore locks its own private copy of the mutex while leaving all other copies unlocked. The underlying `store` map is shared (maps are reference types), so two goroutines can read and write it at the same time with no mutual exclusion at all. In practice this produces data races detected by the race detector, and occasionally a fatal concurrent-map-write panic.

**Fix:** Change both method signatures from `(c Cache)` to `(c *Cache)`. The CHANGE 1 sites replace the value receiver with a pointer receiver on `Set` and `Get`, so every call operates on the single `Cache` instance and its single `mu` field.

**Explanation:** A `sync.Mutex` is valid only at one memory address. When Go passes a value receiver, it copies every byte of the struct — including the internal state fields of `sync.Mutex` — into a new stack variable. Locking that copy has zero effect on the original mutex. Because `store` is a `map[string]string`, the map header (a pointer) is copied but the underlying hash table is not, so all goroutines share the same hash table while each believes it holds the lock. Using a pointer receiver means there is exactly one `Cache` in memory; every call to `Lock` contends on the same mutex, restoring the intended mutual exclusion. A related pitfall: passing a `Cache` value to another function or storing it in an interface also copies the mutex, so pointer receivers alone are not sufficient if the type itself can be freely copied — which leads to issue 2.

---

### Issue 2: NewCache returns a copyable value containing a mutex

**Problem:** `NewCache` returns `Cache` (a value). Any caller can write `c2 := c1` or pass the cache to a function by value, silently duplicating the mutex. `go vet` and `staticcheck` both warn about copying a type that contains `sync.Mutex`, but only if the copy happens in analysed code; a value return in a library bypasses many of those checks in the calling package.

**Fix:** Change the return type of `NewCache` from `Cache` to `*Cache` and return `&Cache{...}` instead of `Cache{...}`. This is the CHANGE 2 site.

**Explanation:** Returning a pointer makes `*Cache` the canonical type for this value throughout the program. Because the pointer receiver methods are defined on `*Cache`, the compiler will refuse to call them on a plain `Cache` value, so accidental copies become compile errors rather than silent misbehaviour. It also communicates intent: a type embedding `sync.Mutex` should never be copied after first use, and a pointer return enforces that at the API boundary. One edge case to keep in mind: if a `*Cache` is stored inside an interface variable and that interface variable is copied, you are copying the pointer (safe), not the struct (unsafe) — so the fix holds for that scenario too.
