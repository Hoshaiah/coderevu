## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Non-nil interface wrapping nil pointer passes nil check and panics later
// ------------------------------------------------------------------------
package notify

import (
	"fmt"
	"os"
)

type Sender interface {
	Send(to, body string) error
}

type SMTPSender struct {
	Host string
}

func (s *SMTPSender) Send(to, body string) error {
	if s.Host == "" {
		return fmt.Errorf("smtp: no host configured")
	}
	fmt.Printf("sending to %s via %s\n", to, s.Host)
	return nil
}

func NewSender() Sender {
	host := os.Getenv("SMTP_HOST")
	if host == "" {
		// CHANGE 1: return an untyped nil instead of a nil *SMTPSender so that callers can detect "no sender" with a plain == nil check on the interface.
		return nil
	}
	return &SMTPSender{Host: host}
}

func InitService() {
	sender := NewSender()
	if sender == nil {
		fmt.Println("warning: no sender configured")
		return
	}
	// CHANGE 2: check the error returned by Send and log it instead of ignoring it.
	if err := sender.Send("ops@example.com", "service started"); err != nil {
		fmt.Printf("warning: failed to send startup notification: %v\n", err)
	}
}
```

## Explanation

### Issue 1: Non-nil interface wraps nil pointer

**Problem:** When `SMTP_HOST` is unset, `NewSender` declares `var s *SMTPSender` (a typed nil pointer) and then returns it as a `Sender` interface. The returned interface value is not nil — it has a concrete type (`*SMTPSender`) stored in its type slot, even though the pointer value is nil. The `sender == nil` guard in `InitService` evaluates to `false`, so the warning is never printed and `Send` is called on a nil receiver, which panics when it tries to read `s.Host`.

**Fix:** In `NewSender`, replace the `var s *SMTPSender` / conditional assignment / `return s` pattern with an early `return nil` when `SMTP_HOST` is empty, and `return &SMTPSender{Host: host}` in the success path. The `return nil` is an untyped nil, so the interface value itself is nil and the `== nil` check in `InitService` works correctly.

**Explanation:** A Go interface value is internally a pair of (type pointer, data pointer). When you assign a typed nil pointer to an interface, the type slot is filled with `*SMTPSender` and the data slot is nil; the interface itself is non-nil. Only when both slots are zero — which happens when you return an untyped `nil` — does `== nil` return `true`. This is one of the most common sources of confusion in Go. The fix avoids the typed nil entirely by never assigning a `*SMTPSender` variable unless a valid host exists. A related pitfall: returning a `(*SMTPSender)(nil)` explicitly would reproduce the bug, so the fix must return the bare `nil` literal.

---

### Issue 2: Send error silently discarded

**Problem:** `InitService` calls `sender.Send(...)` but discards the returned `error`. If the send fails for any reason (bad host, network error, misconfiguration), the operator sees no indication — the service appears to start normally but notifications are lost.

**Fix:** Replace the bare `sender.Send(...)` call with `if err := sender.Send(...); err != nil { fmt.Printf(...) }` so that any error from `Send` is logged before the function returns.

**Explanation:** In Go, ignoring an error return is syntactically legal, so the compiler does not warn about it. Here the `SMTPSender.Send` method returns a meaningful error (e.g., `"smtp: no host configured"`) which would surface the misconfiguration clearly if printed. By checking and logging `err`, operators see actionable output rather than a silent startup. In production code you would typically propagate this error or use a structured logger, but the principle is the same: every `error` return from a meaningful operation should be explicitly handled.
