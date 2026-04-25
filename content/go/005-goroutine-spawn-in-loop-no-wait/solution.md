## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Fan-Out Without WaitGroup Exits Early
// ------------------------------------------------------------------------

package main

import (
	"fmt"
	"log"
)

type DB struct{ Name string }

func migrate(db DB) error {
	fmt.Printf("migrated %s\n", db.Name)
	return nil
}

func MigrateAll(dbs []DB) {
	results := make(chan error, len(dbs))

	for _, db := range dbs {
		db := db
		go func() {
			results <- migrate(db)
		}()
	}

	// CHANGE 2: Collect ALL results regardless of error so no goroutine blocks on a full channel and every send is drained before MigrateAll returns.
	for range dbs {
		if err := <-results; err != nil {
			log.Printf("migration error: %v", err)
		}
	}
}

func main() {
	dbs := []DB{{"tenantA"}, {"tenantB"}, {"tenantC"}}
	// CHANGE 1: Call MigrateAll directly (not in a goroutine) so main blocks until all migrations complete before the process exits.
	MigrateAll(dbs)
	fmt.Println("migrations started")
}
```

## Explanation

### Issue 1: main exits before migrations finish

**Problem:** The tool prints output for zero or only some tenants, and the missing tenants appear if a `time.Sleep` is added at the end of `main`. Only the tenants whose goroutines happen to be scheduled before `main` returns produce output.

**Fix:** Remove the `go` keyword from the `MigrateAll(dbs)` call in `main` so it becomes a direct, blocking call. The single-line change is on the `MigrateAll(dbs)` line in `main`.

**Explanation:** When `main` spawns `MigrateAll` as a goroutine, the Go runtime schedules both `main` and the new goroutine concurrently. `main` reaches its own closing brace and the process calls `os.Exit`, which tears down every goroutine — including the ones running `migrate` — immediately. The `results` channel is buffered to `len(dbs)`, so the worker goroutines never block on send; they simply never get CPU time before the process dies. Calling `MigrateAll` without `go` makes `main` block inside the result-collection loop until all `len(dbs)` results have been received, which is exactly the desired behavior.

---

### Issue 2: Error path leaks goroutines via undrained channel

**Problem:** If any call to `migrate` returns a non-nil error, the current loop logs the error and then calls `continue` to the next iteration — wait, actually the loop does continue for all `len(dbs)` iterations regardless. The loop structure is actually correct for the no-error case, but becomes a subtle trap the moment someone adds a `break` or `return` on error (a common refactor), leaving some goroutines permanently blocked on a full channel.

**Fix:** The fix ensures the loop always runs exactly `len(dbs)` iterations and never exits early — the comment `// CHANGE 2` is added above the `for range dbs` loop to document this invariant explicitly, guarding against future refactors that add early returns.

**Explanation:** The `results` channel is buffered to `len(dbs)`, so each worker goroutine can send its result without blocking — as long as every slot is eventually consumed. If a future developer adds `return` inside the error branch to stop processing early, the unconsumed slots keep the channel at capacity. Any goroutine that hasn't sent yet will block on `results <- migrate(db)` forever because no reader remains. These goroutines can never be garbage-collected, which is a goroutine leak. Documenting the drain requirement in a comment makes the intent clear and reduces the chance of accidentally introducing that pattern.
