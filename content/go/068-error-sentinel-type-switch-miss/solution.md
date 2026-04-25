## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Sentinel Error Missed in Type Switch
// ------------------------------------------------------------------------

package rpc

import (
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("not found")

type TransientError struct{ Msg string }

func (e *TransientError) Error() string { return e.Msg }

func callWithRetry(call func() error) error {
	for attempt := 0; attempt < 3; attempt++ {
		err := call()
		if err == nil {
			return nil
		}
		// CHANGE 1: Replace the bare type switch with errors.As/errors.Is checks so that wrapped errors are unwrapped before classification, matching the RPC layer's documented wrapping behavior.
		var transient *TransientError
		if errors.As(err, &transient) {
			time.Sleep(100 * time.Millisecond)
			continue
		}
		// CHANGE 2: Explicitly check for the wrapped ErrNotFound sentinel using errors.Is so it is correctly treated as permanent instead of being retried.
		if errors.Is(err, ErrNotFound) {
			return err
		}
		return err
	}
	return fmt.Errorf("max retries exceeded")
}
```

## Explanation

### Issue 1: Type Switch Breaks on Wrapped Errors

**Problem:** When the RPC layer wraps an error with `fmt.Errorf("%w", err)`, the runtime type of the returned value is `*fmt.wrapError`, not `*TransientError` or the sentinel `ErrNotFound`. A direct `switch err.(type)` compares the outer wrapper's concrete type, so neither case ever matches a wrapped `*TransientError`. Every wrapped transient error falls into `default` and is returned immediately without retrying — or, if the logic were reversed, every wrapped permanent error would be retried.

**Fix:** Remove the `switch err.(type)` block entirely. Replace it with `errors.As(err, &transient)` to detect a wrapped `*TransientError`, and `errors.Is(err, ErrNotFound)` to detect the wrapped sentinel, as shown at the CHANGE 1 and CHANGE 2 sites.

**Explanation:** `errors.As` walks the error chain by repeatedly calling `Unwrap()` until it finds a value assignable to the target type, so it works regardless of how many layers of wrapping exist. `errors.Is` does the same walk for value equality. A bare type switch does neither — it inspects only the outermost concrete type. Because the RPC README explicitly documents that all returned errors are wrapped with `%w`, relying on a type switch silently misbehaves for every error the layer returns. A related pitfall: if you later add a second level of wrapping (e.g., in middleware), `errors.As`/`errors.Is` still work correctly, whereas any type-switch-based code breaks again without any compile-time warning.

---

### Issue 2: ErrNotFound Sentinel Retried Instead of Returned Immediately

**Problem:** In production, calls that return a wrapped `ErrNotFound` are retried three times before the loop exits. Each retry adds 100 ms of sleep and a redundant RPC call that will also return `ErrNotFound`, causing ~300 ms of extra latency per request and three times the log volume for a class of error that is permanently unrecoverable.

**Fix:** At the CHANGE 2 site, add an explicit `errors.Is(err, ErrNotFound)` guard that returns the error immediately, before any sleep or retry logic executes.

**Explanation:** The original `default` branch was intended to be the permanent-error exit, and under the old (broken) type switch it would have caught `ErrNotFound` — but only if the error were unwrapped. Because the RPC layer wraps errors, `ErrNotFound` arrived as a `*fmt.wrapError` and the type switch sent it to `default` (which did return immediately), but `*TransientError` wrapped was also sent to `default`. Fixing the `TransientError` path with `errors.As` (CHANGE 1) alone would have made the `default` branch the correct fallthrough for all non-transient errors including `ErrNotFound`, but adding the explicit `errors.Is` check (CHANGE 2) makes the intent clear and guards against future refactoring that might reorder the branches or add new error types between them.
