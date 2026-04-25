## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Error Check Before Deferred Close
// ------------------------------------------------------------------------

package main

import (
	"encoding/csv"
	"fmt"
	"os"
)

type Record struct {
	Name  string
	Email string
}

func importCSV(path string) ([]Record, error) {
	f, err := os.Open(path)
	// CHANGE 1: moved error check before defer so f is guaranteed non-nil when defer runs; calling Close on a nil *os.File panics.
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	// CHANGE 2: defer f.Close() now placed after the nil-guard so it only runs when the file was opened successfully.
	defer f.Close()

	var records []Record
	r := csv.NewReader(f)
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	for _, row := range rows {
		if len(row) < 2 {
			continue
		}
		records = append(records, Record{Name: row[0], Email: row[1]})
	}
	return records, nil
}
```

## Explanation

### Issue 1: Defer Before Nil Check Panics

**Problem:** When `os.Open` fails — for example because the file does not exist — it returns `nil` for `*os.File` and a non-nil error. Because `defer f.Close()` is written on the line immediately after `os.Open`, before the error is inspected, the deferred call is registered with `f == nil`. When the function returns, Go runs the deferred `f.Close()`, which dereferences the nil pointer and panics.

**Fix:** The error check (`if err != nil { return ... }`) is moved to execute before the `defer f.Close()` line. The defer is placed after the guard, so `f` is always a valid, non-nil `*os.File` when the deferred close eventually runs.

**Explanation:** `defer` captures the value of `f` at the moment the `defer` statement is evaluated, not at the moment the deferred function runs. At the time `defer f.Close()` is evaluated, `f` is whatever `os.Open` just returned — which may be nil. The deferred call is then unconditionally scheduled. Later, when the enclosing function returns (even via the early `return nil, fmt.Errorf(...)` path), Go executes every registered defer, including `f.Close()` on a nil receiver. The reason this is inconsistent across platforms is not scheduling — it is that on some builds/versions the nil dereference surfaces as a panic and on others the runtime handles it differently. The fix is deterministic: never defer a method on a value that might be nil.

---

### Issue 2: File Handle Leaked on CSV Read Error

**Problem:** Once the defer is placed correctly (after the nil check), the open file handle is properly closed on all return paths because `defer` runs even when the function returns early. This was a latent concern in the original code where the defer's placement before the error check meant a successful open followed by a CSV read error could return without closing the file.

**Fix:** Moving `defer f.Close()` to after the nil-guard (CHANGE 2) ensures it is registered only when `os.Open` succeeds, and Go's defer mechanism then guarantees it fires on every subsequent return path, including the early return inside `if err != nil` after `r.ReadAll()`.

**Explanation:** In Go, a `defer` registered during a function's execution runs when that function exits, regardless of which `return` statement triggers the exit. By placing `defer f.Close()` immediately after the successful open, any later error path — including the `ReadAll` failure — still triggers the close without requiring an explicit `f.Close()` before each `return`. A common mistake is to think you need `f.Close()` before every early return; using defer after a successful open removes that burden and makes future additions to the function safer.
