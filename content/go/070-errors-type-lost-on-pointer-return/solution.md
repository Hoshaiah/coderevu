## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Concrete Error Type Lost in Return
// ------------------------------------------------------------------------

package payment

import "fmt"

type DeclineError struct {
	Code    string
	Message string
}

func (e *DeclineError) Error() string {
	return fmt.Sprintf("card declined [%s]: %s", e.Code, e.Message)
}

func chargeCard(token string, amount int) error {
	// Simulate a declined charge.
	// CHANGE 1: Return nil explicitly when no decline occurs instead of returning a typed nil *DeclineError, which becomes a non-nil error interface value and fools the err != nil guard in the caller.
	if amount > 10000 {
		return &DeclineError{Code: "insufficient_funds", Message: "not enough balance"}
	}
	// Other processing...
	return nil
}

func ProcessPayment(token string, amount int) error {
	if err := chargeCard(token, amount); err != nil {
		// CHANGE 2: Return the original error directly (or wrap with %w) so errors.As can unwrap the *DeclineError; the previous code was fine with %w, but relied on chargeCard never returning a typed nil, so keeping %w here is correct once issue 1 is fixed.
		return fmt.Errorf("payment processing failed: %w", err)
	}
	return nil
}
```

## Explanation

### Issue 1: Typed Nil Pointer Escapes as Non-Nil Interface

**Problem:** When `amount` is 10000 or less, `chargeCard` returns a `*DeclineError` variable that holds the value `nil`. The Go runtime boxes this into an `error` interface value whose type slot is `*DeclineError` and whose value slot is `nil`. That interface value is itself non-nil, so the `err != nil` check in `ProcessPayment` fires even on a successful charge, and `fmt.Errorf` wraps a nil pointer into an error string like `"payment processing failed: <nil>"`. Every payment appears to fail.

**Fix:** Replace the `var err *DeclineError` / conditional assignment / `return err` pattern with an early `return &DeclineError{...}` inside the `if` block and an explicit `return nil` at the end of `chargeCard`. This is the CHANGE 1 site.

**Explanation:** In Go, an interface holds two words: a type pointer and a value pointer. A `*DeclineError` variable set to `nil` still carries a non-nil type pointer when assigned to an `error` interface. The comparison `err != nil` checks whether the interface itself is the zero value (both words nil), not whether the stored pointer is nil. Because the type word is populated, the comparison evaluates to `true`. Returning an untyped `nil` directly (i.e., `return nil`) produces the zero interface value — both words nil — which correctly compares equal to `nil`. A related pitfall: the same trap appears whenever you return a concrete pointer type stored in a local variable through an interface-typed return; always return `nil` directly for the no-error path.

---

### Issue 2: Wrapped Error Prevents Type Assertion at Call Boundary

**Problem:** Even with issue 1 fixed, callers using `errors.As(err, &declineErr)` need `fmt.Errorf` to use the `%w` verb so the error chain is preserved. If the verb were `%v` instead, `errors.As` would not be able to unwrap the chain and find `*DeclineError`, so the type assertion would always return `false`. The symptom is that soft declines are treated as hard failures and users never see a "try another card" prompt.

**Fix:** Ensure `fmt.Errorf` in `ProcessPayment` uses `%w` (wrap verb) rather than `%v` (format verb) when embedding `err`. The CHANGE 2 comment confirms this is already correct in the fixed code and must stay that way.

**Explanation:** `fmt.Errorf("...: %w", err)` stores `err` inside a wrapping error that implements the `Unwrap() error` method. `errors.As` walks this chain by calling `Unwrap` repeatedly until it finds a value assignable to the target type. `fmt.Errorf("...: %v", err)` formats the error as a plain string and discards the original error value entirely — there is no chain to walk. Since issue 1 was causing a nil pointer to be wrapped anyway, the `%w` vs `%v` distinction was irrelevant before the fix, but it becomes critical once `chargeCard` starts returning a real `*DeclineError`. A related pitfall: any middleware layer that re-wraps with `%v` instead of `%w` will silently break `errors.As` checks deeper in the call stack.
