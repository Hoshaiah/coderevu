## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Value Shadowed by String Key
// ------------------------------------------------------------------------

// file: internal/ctxkeys/keys.go
package ctxkeys

// CHANGE 1: Define contextKey and UserIDKey here in the shared package so both auth and billing use the identical key value.
type ContextKey string

const UserIDKey ContextKey = "user_id"

// file: internal/auth/middleware.go
package auth

import (
	"context"
	"net/http"
	"strconv"

	// CHANGE 1: Import the shared ctxkeys package instead of defining a local contextKey type.
	"example.com/app/internal/ctxkeys"
)

// CHANGE 1: Removed the local `type contextKey string` and local `UserIDKey` constant; use ctxkeys.UserIDKey instead.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, _ := strconv.Atoi(r.Header.Get("X-User-ID"))
		// CHANGE 1: Store the value under ctxkeys.UserIDKey so billing handler retrieves with the same key instance.
		ctx := context.WithValue(r.Context(), ctxkeys.UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```

## Explanation

### Issue 1: Context key type mismatch across packages

**Problem:** The billing handler always reads `0` for the user ID. The middleware stores the value under a `contextKey` type defined privately inside the `auth` package. If the billing handler uses any other key — even the identical string `"user_id"` wrapped in a different Go type, or its own separate `contextKey` definition — `ctx.Value()` returns `nil` because Go compares context keys by both type and value.

**Fix:** Create `internal/ctxkeys/keys.go` and move `ContextKey` and `UserIDKey` there (CHANGE 1). Remove the local `type contextKey string` and `const UserIDKey` from `middleware.go`, import `ctxkeys`, and call `context.WithValue` with `ctxkeys.UserIDKey`.

**Explanation:** Go's `context.WithValue` and `ctx.Value` use `==` to match keys. Two variables are `==` only when they share the same type *and* the same underlying value. A `contextKey("user_id")` declared in package `auth` and a `contextKey("user_id")` declared in package `billing` are different named types even though the underlying string is identical — so `ctx.Value` returns `nil` for the billing package's key. The plain string `"user_id"` used in ad-hoc `fmt.Println` debugging *did* work because the middleware happened to store a `contextKey`, not a plain `string`, so those debug calls were hitting a different slot. Moving the key to a single shared package guarantees that every import site refers to the exact same type and constant, making `==` evaluate to `true` and `ctx.Value` return the stored integer.
