## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Wrapped Sentinel Error Not Matchable
// ------------------------------------------------------------------------

package store

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type UserStore struct{}

func (s *UserStore) GetUser(id int) (*User, error) {
	user, ok := memDB[id]
	if !ok {
		// CHANGE 1: Use fmt.Errorf with the %w verb to wrap ErrNotFound so that errors.Is can unwrap and match it; plain string formatting loses the sentinel identity entirely.
		return nil, fmt.Errorf("user %d: %w", id, ErrNotFound)
	}
	return user, nil
}

type User struct {
	ID   int
	Name string
}

var memDB = map[int]*User{
	1: {ID: 1, Name: "Alice"},
}
```

## Explanation

### Issue 1: Sentinel error not wrapped with %w

**Problem:** After the refactor, `GetUser` returns `fmt.Errorf("user %d: not found", id)`, which creates a completely new error value. Any caller that checks `errors.Is(err, store.ErrNotFound)` gets `false`, so the HTTP handler falls through to the 500 branch instead of returning 404.

**Fix:** Replace the format string `"user %d: not found"` and drop the bare string with `"user %d: %w"` and pass `ErrNotFound` as the argument to `%w`. This is the only line changed.

**Explanation:** `fmt.Errorf` with `%w` stores the wrapped error inside the returned error value and implements the `Unwrap() error` interface. `errors.Is` walks that unwrap chain looking for a match against the target sentinel. When you use `%v` or embed the text directly (as the buggy code does), no `Unwrap` method is attached, so the chain has length one and `errors.Is` compares only the top-level pointer, which never equals `ErrNotFound`. The human-readable message can say anything you like as long as the sentinel is passed via `%w`; the text is irrelevant to `errors.Is` matching. A related pitfall: if you construct a custom error struct, you must also implement `Unwrap() error` yourself — `%w` only handles the `fmt.Errorf` case automatically.

---

### Issue 2: Error message embeds sentinel text as a plain string

**Problem:** The refactor replaced a direct return of `ErrNotFound` with a formatted string that happens to contain the words "not found". Because the string is baked in, any code that relied on wrapping (or that tries to add context later with another `fmt.Errorf("%w", ...)`) starts from a dead-end error with no chain to inspect.

**Fix:** Remove the hard-coded `"not found"` substring from the format string and instead pass `ErrNotFound` as the `%w` argument, so the sentinel travels through the error chain intact.

**Explanation:** Go's `errors` package does identity-based matching, not string-based matching. Two calls to `errors.New("not found")` produce two distinct values that are not equal to each other. Embedding the sentinel's message text in a new string does not recreate the sentinel — it just copies some bytes. By passing the actual `ErrNotFound` variable to `%w`, the returned error's `Unwrap` method returns that exact pointer, and `errors.Is` finds it during the chain walk. If you ever need to match on message text (for example in tests against third-party errors you cannot wrap), use `strings.Contains`, but that approach is fragile and should not be the primary mechanism for control flow in production code.
