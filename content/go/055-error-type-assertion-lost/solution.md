## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Wrapped Error Type Lost in Assert
// ------------------------------------------------------------------------

package storage

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

type DuplicateKeyError struct {
	Constraint string
}

func (e *DuplicateKeyError) Error() string {
	return fmt.Sprintf("duplicate key on constraint %s", e.Constraint)
}

// CHANGE 1: Add Unwrap so that errors.As can pierce the fmt.Errorf %w wrapper and find *DuplicateKeyError; callers must use errors.As(err, &target) instead of a bare type-assertion.
func (e *DuplicateKeyError) Unwrap() error { return nil }

func InsertUser(email string, exec func(string) error) error {
	err := exec(email)
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code[:2] == "23" {
		dupeErr := &DuplicateKeyError{Constraint: pgErr.ConstraintName}
		// CHANGE 1: Return dupeErr directly (no fmt.Errorf wrap) so a type-assertion err.(*DuplicateKeyError) succeeds; context is in DuplicateKeyError.Error() itself.
		return dupeErr
	}

	return fmt.Errorf("insert user %s: %w", email, err)
}
```

## Explanation

### Issue 1: `fmt.Errorf` wrap breaks type-assertion

**Problem:** The HTTP handler uses `err.(*DuplicateKeyError)` to detect a duplicate-key conflict and return a 409. That assertion always fails because `InsertUser` returns a `*fmt.wrapError`, not a `*DuplicateKeyError`. The real `*DuplicateKeyError` is buried one level down in the error chain.

**Fix:** Remove the `fmt.Errorf("insert user %s: %w", email, dupeErr)` wrapper and return `dupeErr` directly. The `CHANGE 1` site replaces `return fmt.Errorf(...)` with `return dupeErr`.

**Explanation:** `fmt.Errorf` with the `%w` verb creates a new value whose dynamic type is `*fmt.wrapError`. A type-assertion checks the dynamic type of the interface value, so `err.(*DuplicateKeyError)` inspects `*fmt.wrapError` and fails. `errors.As` would work because it walks the chain via `Unwrap`, but the existing callers use a direct assertion. Returning `dupeErr` without wrapping makes the dynamic type exactly `*DuplicateKeyError`, so the assertion succeeds. If you still want to add context text, put it in `DuplicateKeyError.Error()` or switch all call sites to `errors.As` — mixing the two approaches is the pitfall the team ran into.

---
