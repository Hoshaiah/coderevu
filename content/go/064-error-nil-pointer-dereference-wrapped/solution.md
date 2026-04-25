## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Nil Pointer Inside Non-Nil Error
// ------------------------------------------------------------------------

package storage

import (
	"fmt"
)

// QuotaError is returned when the storage quota is exceeded.
type QuotaError struct {
	Limit int64
	Used  int64
}

func (e *QuotaError) Error() string {
	return fmt.Sprintf("quota exceeded: used %d of %d bytes", e.Used, e.Limit)
}

// sdkUpload simulates the third-party SDK.
func sdkUpload(data []byte) error {
	if len(data) > 1000 {
		return &QuotaError{Limit: 1000, Used: int64(len(data))}
	}
	return nil
}

func Upload(data []byte) error {
	var quotaErr *QuotaError

	if err := sdkUpload(data); err != nil {
		// CHANGE 1: pass **QuotaError so isQuotaError can update the caller's pointer, not a local copy.
		if ok := isQuotaError(err, &quotaErr); ok {
			// CHANGE 2: return quotaErr directly; it is now non-nil because isQuotaError wrote through the pointer.
			return quotaErr
		}
		return fmt.Errorf("upload failed: %w", err)
	}
	return nil
}

// CHANGE 1: accept **QuotaError so the assignment reaches the caller's variable.
func isQuotaError(err error, out **QuotaError) bool {
	target, ok := err.(*QuotaError)
	if ok {
		// CHANGE 1: write through the double pointer to update the caller's quotaErr.
		*out = target
	}
	return ok
}
```

## Explanation

### Issue 1: Pointer Assignment Lost in Helper

**Problem:** `isQuotaError` receives `out *QuotaError` by value. Inside the function, `out = target` reassigns the local parameter, leaving the caller's `quotaErr` variable unchanged and still `nil`. The caller then returns that nil pointer wrapped in a non-nil `error` interface.

**Fix:** Change `isQuotaError`'s second parameter from `*QuotaError` to `**QuotaError`, update the call site in `Upload` to pass `&quotaErr`, and replace `out = target` with `*out = target` inside the helper.

**Explanation:** In Go, function arguments are always passed by value. When `Upload` passes `quotaErr` (a `*QuotaError`) to `isQuotaError`, the function receives its own copy of that pointer. Assigning to `out` inside the function only changes that copy; the original `quotaErr` in `Upload` is untouched. By passing a pointer-to-pointer (`**QuotaError`) and dereferencing it with `*out = target`, the write goes through both levels of indirection and actually modifies `quotaErr` in the calling scope. A simpler alternative would be to return `*QuotaError` from `isQuotaError` and eliminate the out-parameter entirely, but the double-pointer fix is the minimal change that preserves the existing function shape.

---

### Issue 2: Nil Pointer Returned as Non-Nil Error Interface

**Problem:** Before the fix, `quotaErr` is nil when `Upload` executes `return quotaErr`. Go wraps that nil `*QuotaError` pointer in an `error` interface with a non-nil type descriptor, so the returned `error` is not nil. Callers see a non-nil error, `errors.As` fails to match because the concrete value is nil, and calling `.Error()` panics with a nil pointer dereference.

**Fix:** Issue 1's fix ensures `quotaErr` is populated before `return quotaErr` is reached, so the returned interface value carries a valid, non-nil `*QuotaError`.

**Explanation:** An `error` interface value is nil only when both its type and value fields are nil. Returning a typed nil pointer (`var quotaErr *QuotaError; return quotaErr`) produces an interface whose type field is `*QuotaError` and whose value field is nil — the interface itself is not nil. `errors.As` walks the error chain looking for a matching type, but the nil concrete value means there is no `.Error()` method it can safely call, and any direct method call panics. Once Issue 1 is fixed, `quotaErr` points to a real `QuotaError` struct allocated by the SDK, so both the type and value fields of the returned interface are properly populated, `errors.As` succeeds, and `.Error()` works correctly.
