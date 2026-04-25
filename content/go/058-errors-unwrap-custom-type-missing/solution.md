## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Custom Error Type Breaks errors.Is
// ------------------------------------------------------------------------

package store

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type StoreError struct {
	Kind string
	ID   string
	Err  error
}

func (e *StoreError) Error() string {
	return fmt.Sprintf("%s %s: %v", e.Kind, e.ID, e.Err)
}

// CHANGE 1: Add Unwrap so errors.Is can walk the chain and find ErrNotFound inside StoreError.
func (e *StoreError) Unwrap() error {
	return e.Err
}

func GetUser(id string) error {
	// simulate a missing record
	return &StoreError{
		Kind: "user",
		ID:   id,
		Err:  ErrNotFound,
	}
}

func HandleGetUser(id string) (string, error) {
	// CHANGE 2: Call GetUser once and remove the dead err variable; the previous code called GetUser twice and discarded the first result.
	if err := GetUser(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return "", fmt.Errorf("404: %w", err)
		}
		return "", fmt.Errorf("500: %w", err)
	}
	return "user-data", nil
}
```

## Explanation

### Issue 1: Missing `Unwrap` method on `StoreError`

**Problem:** Every call to `errors.Is(err, ErrNotFound)` returns `false` even though `StoreError.Err` holds exactly `ErrNotFound`. HTTP handlers therefore always fall through to the 500 branch and callers never see a 404.

**Fix:** Add an `Unwrap() error` method to `*StoreError` that returns `e.Err`. This is the single addition at the `CHANGE 1` site.

**Explanation:** `errors.Is` does not inspect struct fields directly. It calls `Unwrap()` on each error in the chain and compares each unwrapped value to the target using `==`. Without `Unwrap`, the chain stops at `StoreError` itself, which is not `==` to `ErrNotFound`, so `errors.Is` returns `false`. With `Unwrap` in place, `errors.Is` calls it, gets `ErrNotFound` back, compares that to `ErrNotFound`, and returns `true`. The related pitfall: if you ever wrap `StoreError` inside another error using `fmt.Errorf("%w", ...)`, the outer wrapper already calls `Unwrap`, but `StoreError` still needs its own `Unwrap` for the inner sentinel to be reachable.

---

### Issue 2: `GetUser` called twice with dead-code scaffolding

**Problem:** `HandleGetUser` calls `GetUser(id)` twice — once to assign to `err` (immediately discarded via `_ = err`) and once inside the `if` block. This means two unnecessary store lookups happen on every call, and the logic is harder to follow.

**Fix:** Replace the two-call pattern and the `_ = err` dead variable with a single `if err := GetUser(id); err != nil` statement at the `CHANGE 2` site.

**Explanation:** The original refactor left behind the first call to `GetUser` when the second was added inside the `if` block. Go's compiler forces the `err` variable to be used somewhere, so `_ = err` was added to silence the error, masking the redundancy. Consolidating into a single call in the `if` initializer removes the extra store round-trip, eliminates the dead variable, and makes the control flow read directly.
