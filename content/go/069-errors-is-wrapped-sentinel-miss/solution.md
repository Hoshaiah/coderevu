## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Sentinel Missed Through Error Wrap
// ------------------------------------------------------------------------

package repo

import (
	"database/sql"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID    int
	Email string
}

func GetUser(db *sql.DB, id int) (*User, error) {
	var u User
	err := db.QueryRow("SELECT id, email FROM users WHERE id = $1", id).Scan(&u.ID, &u.Email)
	if err != nil {
		// CHANGE 2: use errors.Is instead of == so any wrapping of sql.ErrNoRows is still matched correctly.
		if errors.Is(err, sql.ErrNoRows) {
			// CHANGE 1: switch %v to %w so errors.Is(err, ErrNotFound) can unwrap through the context string and return true.
			return nil, fmt.Errorf("user %d: %w", id, ErrNotFound)
		}
		return nil, fmt.Errorf("query user %d: %w", id, err)
	}
	return &u, nil
}
```

## Explanation

### Issue 1: `%v` Breaks `errors.Is` Unwrapping

**Problem:** The HTTP handler calls `errors.Is(err, ErrNotFound)` to decide whether to return HTTP 404. After the refactor, that check always returns `false`, so every missing-user lookup returns HTTP 500 instead of HTTP 404.

**Fix:** Replace `%v` with `%w` in the `fmt.Errorf` call that wraps `ErrNotFound`, changing `fmt.Errorf("user %d: %v", id, ErrNotFound)` to `fmt.Errorf("user %d: %w", id, ErrNotFound)`.

**Explanation:** `fmt.Errorf` with `%v` converts the error to its string representation and embeds that string in a new `*errors.errorString`. The chain is severed — the new error has no programmatic link back to `ErrNotFound`. `fmt.Errorf` with `%w` wraps the error value itself, storing a reference that `errors.Is` can follow when it walks the unwrap chain. So `errors.Is(wrappedErr, ErrNotFound)` returns `true` with `%w` and `false` with `%v`, even though both produce similar-looking error messages. A related pitfall: if you ever wrap a third-party sentinel with `%v` for logging, you silently break any caller that relies on `errors.Is` or `errors.As` for that sentinel.

---

### Issue 2: `==` Comparison Misses Wrapped `sql.ErrNoRows`

**Problem:** The code checks `err == sql.ErrNoRows` with a direct equality test. If any future database driver or middleware layer wraps `sql.ErrNoRows` (e.g., adding connection or query metadata), the equality check returns `false`, the `ErrNotFound` branch is skipped, and the raw database error propagates up as HTTP 500.

**Fix:** Replace `err == sql.ErrNoRows` with `errors.Is(err, sql.ErrNoRows)` so the check works regardless of wrapping depth.

**Explanation:** `errors.Is` walks the entire unwrap chain of an error, calling `Unwrap()` at each step and comparing each link to the target. A plain `==` only compares the outermost error value. The standard `database/sql` package currently returns `sql.ErrNoRows` directly, so `==` works today, but it is one driver version or one middleware update away from silently breaking. Using `errors.Is` costs nothing in the normal case and makes the comparison robust against wrapping. This is the same reason the fix for Issue 1 matters: `errors.Is` only helps if the wrapping was done with `%w` in the first place.
