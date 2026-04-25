## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Cancel Function Never Called
// ------------------------------------------------------------------------

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type UserStore interface {
	GetUser(ctx context.Context, id string) (map[string]any, error)
}

type Handler struct {
	store UserStore
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// CHANGE 1: capture the cancel func and defer it so the timer is always released when the handler returns, preventing goroutine and memory leaks.
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.store.GetUser(ctx, r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
```

## Explanation

### Issue 1: Context cancel function never released

**Problem:** The service's goroutine count and memory grow in proportion to request throughput and never come back down until restart. `pprof` shows timer goroutines inside the Go runtime piling up, one per request.

**Fix:** Replace `ctx, _ :=` with `ctx, cancel :=` to capture the cancel function, then add `defer cancel()` immediately after, so the timer is always cleaned up when `ServeHTTP` returns — both on the success path and the error-return path.

**Explanation:** `context.WithTimeout` installs an internal timer in the Go runtime's timer heap and spawns bookkeeping state to fire a cancellation signal when the deadline expires. The only way to release that timer early is to call the returned `cancel` function. When the handler discards `cancel` with `_`, the timer stays live until it fires on its own (5 seconds later) — but at thousands of requests per second that means tens of thousands of timers are always in-flight at once, each holding a goroutine slot and a small heap allocation. Calling `cancel` after the query returns (which the team confirmed is well under 5 s) tears down the timer immediately instead of waiting the full timeout. Using `defer cancel()` is the right pattern because it fires on every return path, including early error returns, so no code path can accidentally skip it.

---

### Issue 2: Blank identifier silences the compiler and linter on the leaked cancel func

**Problem:** Writing `ctx, _ := context.WithTimeout(...)` compiles cleanly and passes `go vet` without any warning, so the leak is invisible during code review and CI. Engineers reading the code later have no signal that a resource obligation is being dropped.

**Fix:** Change `_` to the named variable `cancel` (as in `ctx, cancel := context.WithTimeout(...)`). This is the same token change as CHANGE 1; naming the variable is what allows `defer cancel()` to exist and also lets `go vet` / `staticcheck` enforce that the cancel func is called.

**Explanation:** The Go compiler only requires that you assign both return values; it does not care whether you use the second one if you assign it to `_`. Tools like `staticcheck` have a specific check (`SA1012` / `lostcancel`) that flags when a cancel func is assigned to a named variable but never called — but that check only triggers when the variable is named, not when it is blanked. By naming the variable `cancel` and pairing it with `defer cancel()`, you satisfy both the runtime requirement (timer is released) and the static analysis requirement (the obligation is visibly fulfilled), making future reviewers' intent clear.
