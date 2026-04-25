## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — fmt.Errorf Wraps nil Into Error
// ------------------------------------------------------------------------

package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("user not found")

type Store struct{ db *sql.DB }

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		"SELECT id, email FROM users WHERE email = $1", email,
	).Scan(&u.ID, &u.Email)

	if errors.Is(err, sql.ErrNoRows) {
		// CHANGE 1: Return ErrNotFound directly without wrapping in fmt.Errorf so errors.Is(err, ErrNotFound) works in callers; wrap only real unexpected errors.
		return nil, ErrNotFound
	}

	if err != nil {
		// CHANGE 1: Wrap and return only when a real (non-nil, non-ErrNoRows) error occurred, preventing fmt.Errorf from ever receiving a nil err.
		// CHANGE 2: Return nil instead of &u on the error path so callers don't receive a pointer to a zero-value User.
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	return &u, nil
}
```

## Explanation

### Issue 1: `fmt.Errorf` wraps nil into non-nil error

**Problem:** After a successful query, `err` is `nil`, but the original code unconditionally executes `return &u, fmt.Errorf("lookup user: %w", err)`. `fmt.Errorf` with a `%w` verb and a `nil` argument produces a non-nil `*fmt.wrapError` whose message is `"lookup user: <nil>"`. Callers see a non-nil error on success and every `errors.Is` check fails because the wrapped value is `nil`, not `ErrNotFound`.

**Fix:** Replace the single unconditional `fmt.Errorf` return with two conditional returns: one that returns `ErrNotFound` directly (no wrapping) when `err` is `sql.ErrNoRows`, and one that wraps with `fmt.Errorf` only when `err` is a real unexpected error. When the query succeeds, return `&u, nil` with no `fmt.Errorf` call at all.

**Explanation:** `fmt.Errorf("...: %w", nil)` does not return `nil`; it allocates a `*fmt.wrapError` struct with an `Unwrap` method that returns `nil`. `errors.Is` walks the `Unwrap` chain looking for `ErrNotFound` and never finds it because the chain terminates at `nil`. Returning `ErrNotFound` unwrapped keeps the sentinel intact so `errors.Is` finds an exact pointer match. If you need to add context to `ErrNotFound` itself in the future, you can wrap it (`fmt.Errorf("lookup user: %w", ErrNotFound)`) and `errors.Is` will still work because `%w` stores the original error and `Unwrap` exposes it — the bug was specifically that `nil` was being wrapped, not that wrapping is always wrong.

---

### Issue 2: Non-nil `*User` returned on error path

**Problem:** When the query fails (including the `ErrNotFound` case after the refactor), the original code returns `&u` — a pointer to a zero-value `User` struct — alongside the error. A caller that checks `err != nil` correctly will never dereference `u`, but a caller that checks only `errors.Is` (which was broken) or forgets to check `err` will silently operate on a `User` with `ID == 0` and `Email == ""`.

**Fix:** Change both error returns to use `nil` as the `*User` value: `return nil, ErrNotFound` and `return nil, fmt.Errorf(...)`. The successful path still returns `&u, nil` unchanged.

**Explanation:** Go convention for functions returning a pointer and an error is to return `nil` for the pointer whenever `err != nil`. Returning a non-nil pointer alongside a non-nil error forces every caller to remember to check the error before using the pointer, and makes nil-checks on the returned pointer useless as a proxy for success. Returning `nil` on the error path makes the zero-value behavior obvious and prevents accidental use of uninitialized data.
