## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Value Lost with String Key
// ------------------------------------------------------------------------

package main

import (
	"context"
	"fmt"
	"net/http"
)

// shared key type — defined once, used by both middleware and handler
type contextKey string

const userIDKey contextKey = "userID"

// middleware/auth.go
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := extractUserID(r)
		// CHANGE 1: use userIDKey (type contextKey) instead of the plain string "userID" so the key type matches what the handler reads
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// handler/profile.go
func ProfileHandler(w http.ResponseWriter, r *http.Request) {
	// CHANGE 2: userIDKey is now the same variable used in AuthMiddleware, so ctx.Value finds the stored entry
	userID, ok := r.Context().Value(userIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	fmt.Fprintf(w, "hello %s", userID)
}

func extractUserID(r *http.Request) string { return "alice" }

func main() {}
```

## Explanation

### Issue 1: Context key type mismatch causes nil lookup

**Problem:** The middleware stores the user ID with the key `"userID"` (type `string`), but the handler reads it with `userIDKey` (type `contextKey`, a named string type). `ctx.Value` returns nil because the keys are different types, so the handler always hits the unauthorized branch even for valid JWTs.

**Fix:** Replace the plain string literal `"userID"` in `context.WithValue` inside `AuthMiddleware` with `userIDKey` (the typed constant), so both sides use an identical key — same type and same underlying value.

**Explanation:** Go's `context.WithValue` and `ctx.Value` compare keys with `==`, which in Go requires both the type and value to match. `string("userID")` and `contextKey("userID")` have equal underlying bytes but different static types, so `==` returns false and the lookup misses. This is intentional in Go's design: using a named private type prevents accidental collisions between packages that might independently use the same string. The fix is to use one shared constant of the correct named type everywhere. A related pitfall is using a `string` key directly — the Go documentation explicitly warns against using built-in types as context keys for exactly this reason.

---

### Issue 2: Key type defined in only one package, guaranteeing divergence

**Problem:** `contextKey` and `userIDKey` were declared inside the handler package only. The middleware, living in a separate package, had no access to them and was forced to use a raw string, making the type mismatch structurally unavoidable.

**Fix:** Move the `contextKey` type declaration and `userIDKey` constant to a shared location (here, the same file/package) so both `AuthMiddleware` and `ProfileHandler` import and use the same `userIDKey` variable.

**Explanation:** When context keys are defined in only one package and another package needs to set the same key, developers reach for the raw string value because it looks equivalent. It is not, because the named type is the key, not its string content. The right pattern is to define the key type and constant in a shared internal package (e.g., `internal/ctxkeys`) and import it in both the middleware and handler packages. Keeping the type unexported within that shared package still prevents outside packages from constructing colliding keys, while letting your own middleware and handlers agree on the exact key to use.
