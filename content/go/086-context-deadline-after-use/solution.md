## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Deadline Set After Blocking Call
// ------------------------------------------------------------------------

package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"
)

func main() {
	secs, _ := strconv.Atoi(os.Getenv("MIGRATION_TIMEOUT_SECS"))
	if secs == 0 {
		secs = 30
	}

	ctx := context.Background()

	// CHANGE 1: context.WithTimeout is now called BEFORE runMigrations so the deadline is active during the migration, not after it finishes.
	ctx, cancel := context.WithTimeout(ctx, time.Duration(secs)*time.Second)
	defer cancel()

	// CHANGE 2: the timeout-bound ctx is passed to runMigrations so it receives cancellation signals when the deadline expires.
	err := runMigrations(ctx)

	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	if ctx.Err() != nil {
		log.Fatal("migration timed out")
	}
	log.Println("migrations complete")
}
```

## Explanation

### Issue 1: Timeout Created After Blocking Call

**Problem:** The timeout context is created after `runMigrations` returns, so the 30-second deadline is set on a context that is never used during the actual migration. The migration runs against the plain `context.Background()` which has no deadline, and operators see the process run for minutes without aborting.

**Fix:** Move `ctx, cancel := context.WithTimeout(ctx, time.Duration(secs)*time.Second)` and its `defer cancel()` to before the call to `runMigrations`, as shown at the CHANGE 1 site.

**Explanation:** `context.WithTimeout` returns a new context with a deadline baked in; it does not modify the parent context. The original code created that deadline-carrying context only after `runMigrations` had already finished, which means the call to `runMigrations` used the original `context.Background()` that never expires. Moving `context.WithTimeout` above the blocking call means the deadline starts ticking before the migration begins, so the context is cancelled when the budget is exceeded.

---

### Issue 2: Timeout Context Not Passed to Migration Function

**Problem:** Even if the timeout were created at the right time, the original code passes `ctx` — which at that point is still the plain background context — to `runMigrations`. The migration function polls `ctx.Done()` but that channel never closes, so cancellation is never delivered.

**Fix:** After moving `context.WithTimeout` above `runMigrations` (CHANGE 1), the variable `ctx` is rebound to the timeout-bearing context by the short variable declaration. Passing this rebound `ctx` to `runMigrations` at the CHANGE 2 site ensures the function receives the context that carries the deadline.

**Explanation:** In Go, `ctx, cancel := context.WithTimeout(...)` reassigns `ctx` in the current scope to the new derived context. Any code that runs after this line and uses `ctx` gets the deadline-carrying version. In the buggy code, `runMigrations(ctx)` appeared before that reassignment, so it captured the original background context. After the fix, `runMigrations(ctx)` appears after the reassignment, so `ctx` holds the timeout context and `ctx.Done()` closes when the deadline fires. A related pitfall: if you shadow `ctx` in a nested scope (e.g., inside an `if` block) the outer variable is unaffected, so always check that `context.WithTimeout` is in the same scope and is evaluated before the blocking call.
