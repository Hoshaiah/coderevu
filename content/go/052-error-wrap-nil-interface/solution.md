## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Nil Error Becomes Non-Nil Interface
// ------------------------------------------------------------------------

package store

import "fmt"

type DBError struct {
	Code    int
	Message string
}

func (e *DBError) Error() string {
	return fmt.Sprintf("db error %d: %s", e.Code, e.Message)
}

func queryDB(userID int) *DBError {
	// returns nil on success
	if userID <= 0 {
		return &DBError{Code: 400, Message: "invalid user id"}
	}
	return nil
}

func QueryUser(userID int) error {
	dbErr := queryDB(userID)
	// CHANGE 1: check the concrete *DBError for nil before boxing it into the error interface; returning dbErr directly when it is non-nil is fine, but returning a typed nil *DBError as error produces a non-nil interface, so we return the untyped nil instead.
	if dbErr != nil {
		return dbErr
	}
	return nil
}

func HandleRequest(userID int) string {
	if err := QueryUser(userID); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}
```

## Explanation

### Issue 1: Typed nil pointer boxed into non-nil interface

**Problem:** Every call to `QueryUser` with a valid user ID returns `"error: <nil>"` from `HandleRequest`, and the caller receives a 500 response, even though the database query succeeded and no error was set.

**Fix:** In `QueryUser`, check whether `dbErr != nil` before returning it. If the concrete pointer is nil, return the untyped `nil` literal instead of returning `dbErr` (a typed nil `*DBError`) directly as the `error` interface.

**Explanation:** An `error` interface value in Go is a pair of (type, pointer). When you assign a `*DBError` variable — even one holding nil — to an `error`, Go stores the `*DBError` type descriptor in the interface's type slot, making the interface itself non-nil even though the underlying pointer is nil. The `err != nil` check in `HandleRequest` inspects the interface pair, sees a non-nil type, and evaluates to `true` on every success path. Returning the untyped `nil` literal instead leaves both slots of the interface as nil, so `err != nil` correctly evaluates to `false`. A related pitfall: this same issue occurs any time a function returns a concrete error type (e.g., `*os.PathError`) through an `error` return — always compare the concrete value to nil before returning it as an interface, or declare the local variable as `error` from the start so the nil is already untyped.

---

### Issue 2: Local variable declared as concrete *DBError instead of error interface

**Problem:** The variable `dbErr` is declared as `var dbErr *DBError`, which forces the nil pointer to be stored with type information when it is returned as `error`. This is the mechanical root cause of issue 1 and would affect any future reader who copies the pattern.

**Fix:** The CHANGE 1 site removes the typed `var dbErr *DBError` declaration (now written as `dbErr := queryDB(userID)`, inferred as `*DBError`) and adds an explicit nil check so the untyped `nil` is returned on the success path rather than the typed value.

**Explanation:** Even with the short variable declaration, `dbErr` is still of type `*DBError` because that is what `queryDB` returns. The nil check added at CHANGE 1 is what actually prevents the typed nil from reaching the `error` interface. An alternative fix would be to declare `var dbErr error = queryDB(userID)`, but that stores the `*DBError` type immediately at assignment time and has the same problem. The only safe approaches are: (a) check the concrete value for nil and return an untyped nil as shown, or (b) change `queryDB` itself to return `error` so the boxing never involves a concrete type.
