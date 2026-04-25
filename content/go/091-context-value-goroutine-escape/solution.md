## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Value Escapes Its Goroutine
// ------------------------------------------------------------------------

package middleware

import (
	"context"
	"net/http"
)

type contextKey string

const accKey contextKey = "accumulator"

type Accumulator struct {
	DBMs    float64
	CacheMs float64
}

func (a *Accumulator) AddDB(ms float64)    { a.DBMs += ms }
func (a *Accumulator) AddCache(ms float64) { a.CacheMs += ms }

// CHANGE 1: removed `var sharedAcc Accumulator` — a package-level variable shared across all goroutines is the root cause of the race.

func RequestMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// CHANGE 1: allocate a fresh Accumulator per request instead of resetting the shared one, so each goroutine owns its own instance.
		acc := &Accumulator{}
		ctx := context.WithValue(r.Context(), accKey, acc)
		next.ServeHTTP(w, r.WithContext(ctx))
		emitMetrics(acc)
	})
}

func emitMetrics(a *Accumulator) { /* send to metrics backend */ }
func GetAccumulator(ctx context.Context) *Accumulator {
	return ctx.Value(accKey).(*Accumulator)
}
```

## Explanation

### Issue 1: Shared Package-Level Accumulator Races

**Problem:** Every concurrent HTTP request resets and then writes to the same `sharedAcc` variable. The race detector flags fields like `DBMs` and `CacheMs` because one goroutine can be writing them while another goroutine is simultaneously resetting the struct or reading it in `emitMetrics`.

**Fix:** Remove the `var sharedAcc Accumulator` package-level variable entirely. Inside the handler closure, replace `sharedAcc = Accumulator{}` and `&sharedAcc` with a single local allocation: `acc := &Accumulator{}`. Pass `acc` directly to `context.WithValue` and to `emitMetrics`.

**Explanation:** A package-level variable has exactly one address for the entire lifetime of the process. When the middleware resets it with `sharedAcc = Accumulator{}` and then stores `&sharedAcc` in the context, every concurrent request stores a pointer to the same memory. Request A can be halfway through writing `DBMs` while request B overwrites the whole struct during its reset. Allocating with `acc := &Accumulator{}` gives each request call its own heap object; Go's garbage collector keeps it alive until no goroutine holds a reference, so there is no lifetime problem. A related pitfall: even if you added a mutex around the reset, you would still serialize all requests through a single bottleneck — the correct fix is per-request allocation, not synchronization.

---

### Issue 2: Reset-Then-Take-Address Is Not Atomic

**Problem:** The two-step sequence `sharedAcc = Accumulator{}` followed immediately by `&sharedAcc` looks like a safe reset, but between those two lines another goroutine can execute the same two lines, making the first goroutine's pointer now point at the second goroutine's freshly zeroed accumulator.

**Fix:** The same `acc := &Accumulator{}` allocation from CHANGE 1 eliminates this issue as a side effect: there is no separate reset step, so there is no window between resetting and capturing the address.

**Explanation:** On the current code path, `sharedAcc = Accumulator{}` writes a zero-value struct to the global variable, and `&sharedAcc` takes the address of that global. Both operations together are not atomic from the scheduler's perspective. A second goroutine can run its own `sharedAcc = Accumulator{}` between those two lines in the first goroutine, so both goroutines end up with a pointer to the same location and both believe they exclusively own it. Because `acc := &Accumulator{}` produces a new allocation each time, the address is unique to the current goroutine's stack frame scope and the problem cannot arise. A related pitfall to watch for: sync/atomic cannot protect a struct-level assignment like this because the struct is larger than a single word on most platforms, reinforcing that per-request allocation is the only clean solution.
