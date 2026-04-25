## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — HTTP client timeout overflows and becomes nearly infinite
// ------------------------------------------------------------------------
package gateway

import (
	"net/http"
	"time"
)

type Config struct {
	TimeoutSeconds int
}

func NewClient(cfg Config) *http.Client {
	return &http.Client{
		Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second,
	}
}

func NewClientFast(timeoutSeconds int) *http.Client {
	// CHANGE 2: guard against zero or negative values that disable the timeout entirely
	if timeoutSeconds <= 0 {
		timeoutSeconds = 30
	}
	return &http.Client{
		// CHANGE 1: convert to time.Duration first, then multiply by time.Second; doing the multiplication in plain int overflows on 32-bit targets because time.Second is 1_000_000_000 and int may be 32 bits wide.
		Timeout: time.Duration(timeoutSeconds) * time.Second,
	}
}
```

## Explanation

### Issue 1: Integer overflow before Duration conversion

**Problem:** On a 32-bit platform (or when the compiler evaluates `timeoutSeconds * time.Second` as a plain `int` expression), the multiplication overflows before the result is ever cast to `time.Duration`. `time.Second` is `1_000_000_000` nanoseconds; even a modest value like `30` seconds requires `30_000_000_000`, which exceeds the range of a 32-bit signed integer (`2_147_483_647`). The result wraps to a small or negative number, so the `http.Client` gets a near-zero timeout and the service either fires requests with no practical deadline or hangs.

**Fix:** Replace `time.Duration(timeoutSeconds * time.Second)` with `time.Duration(timeoutSeconds) * time.Second`. This converts the integer to `time.Duration` first (a 64-bit type on all Go platforms), then multiplies — exactly what `NewClient` already does correctly.

**Explanation:** In Go, `time.Second` is a `time.Duration` constant whose underlying type is `int64`. When you write `timeoutSeconds * time.Second` where `timeoutSeconds` is a plain `int`, the compiler resolves the multiplication in the narrower integer type before the outer `time.Duration(...)` cast runs. On a 32-bit target `int` is 32 bits wide, so any timeout above ~2 seconds wraps. Converting `timeoutSeconds` to `time.Duration` (which is always 64 bits) before the multiplication avoids this entirely. The pattern `time.Duration(n) * time.Second` is the idiomatic Go form and is what the standard library itself uses.

---

### Issue 2: Zero or negative timeout disables deadline entirely

**Problem:** `http.Client.Timeout` set to `0` means no timeout at all — the client waits forever. If `timeoutSeconds` arrives as `0` (a misconfigured config value, a default-zero struct field, or a bug in the caller), `NewClientFast` silently creates a client with no deadline. The service then hangs indefinitely on slow or unresponsive gateways, which is exactly the symptom the team observed in load tests.

**Fix:** Add a guard at the top of `NewClientFast` that resets `timeoutSeconds` to `30` when the value is `<= 0`, before the `http.Client` is constructed. This is the `// CHANGE 2` block added before the `return` statement.

**Explanation:** Go zero-initializes all struct fields, so a `Config` or a caller that forgets to set `TimeoutSeconds` will produce `0`. Because `http.Client` treats `Timeout == 0` as "no timeout", this failure mode is invisible at construction time — the client looks valid but carries no deadline. A negative value is equally dangerous. Defaulting to a known-safe value (30 seconds here) makes the function safe to call even from code that does not explicitly configure the timeout. A stricter alternative is to return an error, but a safe default is appropriate when the function signature does not allow returning an error.
