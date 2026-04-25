## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Value Panics on Type Assert
// ------------------------------------------------------------------------

package auth

import (
	"context"
	"net/http"
)

type contextKey string

const userIDKey contextKey = "userID"

func SetUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

// CHANGE 1: Use the comma-ok idiom instead of a bare type assertion so that a missing or nil value returns "", false instead of panicking.
// CHANGE 2: Return a second bool so callers can detect the unauthenticated case and act on it (e.g. return 401) rather than silently operating on an empty string.
func UserIDFromContext(ctx context.Context) (string, bool) {
	id, ok := ctx.Value(userIDKey).(string)
	return id, ok
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := SetUserID(r.Context(), token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```

## Explanation

### Issue 1: Unsafe type assertion causes panic

**Problem:** When a request bypasses `RequireAuth` (e.g. an OPTIONS preflight handled by CORS middleware before auth runs), the `userIDKey` is never stored in the context. `ctx.Value(userIDKey)` returns `nil`. The bare assertion `ctx.Value(userIDKey).(string)` on a `nil` interface value panics with `interface conversion: interface {} is nil, not string`.

**Fix:** Replace the bare assertion `ctx.Value(userIDKey).(string)` with the comma-ok form `id, ok := ctx.Value(userIDKey).(string)` and return both values. When the key is absent, `id` is `""` and `ok` is `false` — no panic.

**Explanation:** A bare type assertion `x.(T)` panics if `x` is `nil` or holds a different dynamic type. The comma-ok form `v, ok := x.(T)` never panics; it sets `ok` to `false` and `v` to the zero value of `T` instead. Because CORS middleware short-circuits OPTIONS requests before `RequireAuth` runs, the context carries no `userIDKey` entry. The downstream handler calls `UserIDFromContext`, hits the bare assertion on a nil value, and the server crashes the goroutine for that request. Using the comma-ok form makes the assertion safe regardless of which middlewares ran.

---

### Issue 2: Missing return value hides unauthenticated requests from callers

**Problem:** Even after making the assertion safe, returning only a `string` gives callers no way to tell whether the empty string means "this user has ID ''" or "no user was set at all". A handler that does `id := UserIDFromContext(ctx)` and then queries the database with an empty `id` silently scopes the query incorrectly instead of rejecting the request.

**Fix:** Change the signature of `UserIDFromContext` to `(string, bool)`, returning the `ok` result from the comma-ok assertion. Callers check the `bool` and can return a `401` or skip the database call when `ok` is `false`.

**Explanation:** Go's `context.Value` returns `interface{}`, and the zero value of `string` (`""`) is a legitimate value that could theoretically be stored. Returning only the string conflates two distinct situations: value-present-but-empty and value-absent. The `bool` return makes the distinction explicit, the same way `map` lookups and channel receives use the comma-ok idiom. Handlers that previously ignored the missing-value case can now guard with `if id, ok := auth.UserIDFromContext(r.Context()); !ok { http.Error(...); return }`, preventing silent misbehavior on unauthenticated paths.
