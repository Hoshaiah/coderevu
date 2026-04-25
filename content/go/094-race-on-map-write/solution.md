## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Concurrent map writes cause random panics in the HTTP handler
// ------------------------------------------------------------------------
package ratelimit

import (
	"net/http"
	"sync"
	"time"
)

type Limiter struct {
	mu      sync.Mutex
	counts  map[string]int
	resetAt time.Time
}

func NewLimiter() *Limiter {
	return &Limiter{
		counts:  make(map[string]int),
		resetAt: time.Now().Add(time.Minute),
	}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	// CHANGE 2: defer unlock so the mutex is held for the entire function, including the return value read below, preventing any window where the map is read without the lock held.
	defer l.mu.Unlock()
	if time.Now().After(l.resetAt) {
		l.counts = make(map[string]int)
		l.resetAt = time.Now().Add(time.Minute)
	}
	l.counts[key]++
	// CHANGE 1: read l.counts[key] while still holding the mutex (via defer) instead of after Unlock(), eliminating the concurrent map read/write race.
	return l.counts[key] <= 100
}

var _ = http.ListenAndServe
```

## Explanation

### Issue 1: Map read after mutex unlock races with writers

**Problem:** The server panics with "concurrent map read and map write" under load. The original code calls `l.mu.Unlock()` and then reads `l.counts[key]` on the next line. Any goroutine that enters `Allow` between those two lines can write to `l.counts` while the first goroutine is still reading it.

**Fix:** Replace the explicit `l.mu.Unlock()` call with `defer l.mu.Unlock()` placed right after `l.mu.Lock()`. This keeps the mutex locked through the `return l.counts[key] <= 100` statement, so the final map read is never exposed to concurrent writers.

**Explanation:** Go's map implementation is not safe for concurrent use. Even a single concurrent read and write (not two writes) triggers the runtime's race detector and can cause a panic. The original code held the lock during the write (`l.counts[key]++`) but released it before the read (`return l.counts[key] <= 100`). Under high concurrency, another goroutine's write lands in that gap and the runtime panics. Using `defer l.mu.Unlock()` extends the critical section to include the return expression, closing the gap entirely. A related pitfall: if you add early-return branches to this function in the future, `defer` ensures the mutex is still released correctly on every path.

---

### Issue 2: Increment and read are split, making the result stale

**Problem:** Even ignoring the race, reading `l.counts[key]` after `l.mu.Unlock()` does not necessarily return the value that was just written by this goroutine. Another goroutine could have incremented the same key in between, so the returned count may be higher than this goroutine's own increment produced.

**Fix:** By keeping the mutex held via `defer l.mu.Unlock()` through the `return` statement (CHANGE 2), the read of `l.counts[key]` on the return line is guaranteed to see exactly the value this goroutine wrote — no interleaving increments are possible.

**Explanation:** The original code incremented under the lock, then unlocked, then read the map again. Those are two separate map accesses. Between unlock and the second access, any number of other goroutines can increment the same key. The value read on return is therefore the count after all those additional increments, not the count at the moment this goroutine ran its own increment. Holding the lock continuously from increment through the read ensures the two operations are atomic from the perspective of all other goroutines.
