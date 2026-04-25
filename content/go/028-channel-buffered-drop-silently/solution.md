## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Buffered Channel Silently Drops Events
// ------------------------------------------------------------------------

package audit

import "log"

type Event struct {
	UserID string
	Action string
}

type Emitter struct {
	ch chan Event
}

func NewEmitter() *Emitter {
	e := &Emitter{ch: make(chan Event, 512)}
	go e.drain()
	return e
}

// CHANGE 2: return bool so callers can detect and handle a dropped event instead of always getting nothing back.
func (e *Emitter) Emit(ev Event) bool {
	select {
	case e.ch <- ev:
		return true
	default:
		// CHANGE 1: log the drop instead of discarding it silently, so operators see evidence of queue overflow in logs.
		log.Printf("audit: channel full, dropping event userID=%s action=%s", ev.UserID, ev.Action)
		return false
	}
}

func (e *Emitter) drain() {
	for ev := range e.ch {
		if err := writeToDatabase(ev); err != nil {
			log.Printf("audit write error: %v", err)
		}
	}
}

func writeToDatabase(ev Event) error { return nil }
```

## Explanation

### Issue 1: Silent Drop Hides Queue Overflow

**Problem:** When the channel is full, `Emit` falls into the `default` branch and discards the event with no log line, no metric, and no error. Operators see gaps in the audit log but have no signal in any log or monitoring system that events were ever dropped.

**Fix:** Replace the empty `default` body with a `log.Printf` call that names the dropped event's `UserID` and `Action`, so every overflow produces a visible log entry.

**Explanation:** Go's `select` with a `default` branch is non-blocking: if `e.ch <- ev` cannot proceed immediately, execution jumps straight to `default`. The original code put nothing there, so the drop was completely invisible. Adding a log line means that the first spike produces noisy log output, which is exactly the signal operators need to decide whether to raise the buffer size, apply back-pressure, or route events to a fallback store. A related pitfall: if the drop rate is very high, the log itself can become noisy; teams often replace the `log.Printf` with an atomic counter and a periodic summary log once they've confirmed the root cause.

---

### Issue 2: Emit Returns Nothing, Caller Cannot React

**Problem:** `Emit` has no return value, so the HTTP middleware that calls it has no programmatic way to detect that an event was dropped. Even if the team wanted to add a fallback path (like writing to a secondary queue or returning an error header), the current signature makes it impossible.

**Fix:** Change the signature from `func (e *Emitter) Emit(ev Event)` to `func (e *Emitter) Emit(ev Event) bool`, returning `true` on successful enqueue and `false` on drop.

**Explanation:** Without a return value, the contract of `Emit` is "fire and forget with no feedback". That is fine when drops are acceptable and observable through other means, but this codebase has neither a metric nor a log for drops, making the return value the only remaining hook for the caller. Returning a `bool` costs nothing at the call site when ignored (`_ = e.Emit(ev)`) but gives the middleware the option to log at the request level, increment a Prometheus counter, or enqueue to a dead-letter store. The change is backward-compatible in spirit: callers that don't check the return value compile and run exactly as before.
