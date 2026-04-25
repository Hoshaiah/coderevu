## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context Key Collision via String Type
// ------------------------------------------------------------------------

package auth

import (
	"context"
	"net/http"
)

// CHANGE 1: Define an unexported package-local key type so no other package can construct or collide with this key.
type contextKey string

// CHANGE 1: Use a typed constant of the local key type instead of a raw string literal.
const userIDKey contextKey = "userID"

func UserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("X-User-ID")
		// CHANGE 1: Store the value under the typed key, not the plain string "userID".
		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserID(ctx context.Context) string {
	// CHANGE 1: Retrieve using the typed key so only this package can read its own value.
	v, _ := ctx.Value(userIDKey).(string)
	return v
}

// --- pkg/audit/middleware.go ---

// package audit
//
// import (
// 	"context"
// 	"net/http"
// )
//
// // CHANGE 2: Define a separate unexported key type scoped to the audit package.
// type contextKey string
//
// // CHANGE 2: Use a distinct typed constant; even though the underlying string is the same,
// // audit.contextKey and auth.contextKey are different types, so context.WithValue treats them as different keys.
// const correlationIDKey contextKey = "correlationID"
//
// func CorrelationMiddleware(next http.Handler) http.Handler {
// 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		corrID := r.Header.Get("X-Correlation-ID")
// 		// CHANGE 2: Store under the audit-package-local key, not the plain "userID" string.
// 		ctx := context.WithValue(r.Context(), correlationIDKey, corrID)
// 		next.ServeHTTP(w, r.WithContext(ctx))
// 	})
// }
//
// func GetCorrelationID(ctx context.Context) string {
// 	// CHANGE 2: Retrieve using the audit-local typed key.
// 	v, _ := ctx.Value(correlationIDKey).(string)
// 	return v
// }
```

## Explanation

### Issue 1: Plain String Context Key Collision Between Packages

**Problem:** When both middleware layers are composed, the audit middleware calls `context.WithValue(r.Context(), "userID", corrID)` — exactly the same key string the auth middleware used. Because the context is layered (auth sets it first, then audit wraps it again), `ctx.Value("userID")` always returns the correlation ID, and `GetUserID` returns the wrong value. Audit logs show user IDs that are actually correlation IDs, and vice versa, with no error anywhere.

**Fix:** Replace the raw string literal `"userID"` in both packages with package-local typed constants (`userIDKey` in `auth`, `correlationIDKey` in `audit`), each declared as a distinct unexported `type contextKey string`. The `context.WithValue` and `ctx.Value` calls are updated to use these typed constants.

**Explanation:** The Go context package compares keys using `==`. Two values are equal only if they have both the same type and the same value. A plain `string` like `"userID"` is equal to any other `string("userID")` regardless of which package wrote it, so the second `context.WithValue` call shadows the first. By declaring `type contextKey string` as an unexported type inside each package, `auth.contextKey("userID")` and `audit.contextKey("userID")` are values of two distinct Go types and can never be `==`, even if the underlying string happens to match. External packages also cannot construct a value of an unexported type, which means no third party can accidentally or intentionally read or overwrite private context entries.

---

### Issue 2: Exported or Built-In Types as Context Keys Allow Unintended Cross-Package Access

**Problem:** Using a built-in type like `string` as a context key means any code anywhere in the binary that knows the key string can read or shadow the stored value. There is no compiler or runtime protection; the collision is entirely silent.

**Fix:** Each package defines its own `type contextKey string` (unexported) and uses a `const` of that type as the key. This is the change at the `CHANGE 2` site in `pkg/audit/middleware.go`: `correlationIDKey` is typed `contextKey` (the audit-local type), not the built-in `string`.

**Explanation:** Go's type system distinguishes named types even when the underlying representation is identical. `auth.contextKey` and `audit.contextKey` are two separate named types; a value of one type will not compare equal to a value of the other, so `ctx.Value` correctly segregates them. Additionally, because both `contextKey` types are unexported, code outside each package cannot even name the type to construct a matching key, which prevents accidental reads from other packages in the future. A related pitfall: using a type alias (`type contextKey = string`) instead of a type definition (`type contextKey string`) would not help, because aliases are interchangeable with the underlying type and the collision would still occur.
