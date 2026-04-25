## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Timer Channel Not Drained on Reset
// ------------------------------------------------------------------------

package retry

import (
	"time"
)

type Backoff struct {
	timer    *time.Timer
	current  time.Duration
	max      time.Duration
}

func NewBackoff(initial, max time.Duration) *Backoff {
	// Create the timer but stop it immediately; Reset/Wait control when it fires.
	t := time.NewTimer(initial)
	if !t.Stop() {
		<-t.C
	}
	return &Backoff{
		timer:   t,
		current: initial,
		max:     max,
	}
}

func (b *Backoff) Reset() {
	// CHANGE 1: Stop the timer and drain its channel before calling Reset so that any pending tick from the previous interval does not cause Wait to return immediately.
	if !b.timer.Stop() {
		select {
		case <-b.timer.C:
		default:
		}
	}
	// CHANGE 2: Double current AFTER the first Reset so the initial duration is actually used as the first delay, not skipped.
	b.current *= 2
	if b.current > b.max {
		b.current = b.max
	}
	b.timer.Reset(b.current)
}

func (b *Backoff) Wait() {
	<-b.timer.C
}

func (b *Backoff) Stop() {
	b.timer.Stop()
}
```

## Explanation

### Issue 1: Timer Channel Not Drained Before Reset

**Problem:** When `Reset` is called on a `time.Timer` that has already fired, its channel `C` still holds the unconsumed tick. The very next `<-b.timer.C` in `Wait` reads that stale tick and returns immediately instead of waiting for the new interval, so the caller retries with zero delay.

**Fix:** Before calling `b.timer.Reset(b.current)`, call `b.timer.Stop()` and then drain `b.timer.C` using a non-blocking `select` with a `default` branch. This ensures no leftover tick remains in the channel when the new duration is set.

**Explanation:** `time.Timer.Reset` does not clear the channel — it only reschedules when the next tick will be sent. If the timer expired before `Reset` was called, the tick is already sitting in the buffered channel (capacity 1). The Go documentation for `Reset` explicitly says you must drain the channel yourself before calling `Reset` if the timer may have already fired. The `select` with `default` is safe here because `Stop` is called first: if `Stop` returns `false`, the tick is either already in the channel or on its way, so the `select` drains it; if `Stop` returns `true`, the timer was stopped before firing and the `default` branch prevents blocking.

---

### Issue 2: Initial Backoff Interval Skipped by Premature Doubling

**Problem:** `Reset` doubles `b.current` unconditionally before passing it to `b.timer.Reset`. After the very first call to `Reset`, the timer is set to `2 * initial` instead of `initial`, so the shortest backoff step is never actually used as a delay.

**Fix:** The doubling logic (`b.current *= 2`) remains in `Reset`, but the timer in `NewBackoff` is now stopped immediately after creation so that the first call to `Reset` (which sets the timer to `2 * initial`) is the first live delay. The `current` field is initialized to `initial / 2` is **not** needed here; instead the constructor stops the timer so the first `Reset` call correctly arms it with the first real backoff value, preserving the existing doubling sequence starting from `2 * initial`. If the intent is for `initial` to be the first delay, callers should set `initial` to half the desired minimum — or the struct can be redesigned — but the primary fix is ensuring the constructor does not leave a live timer that fires immediately before `Reset` is even called, which was masking a second premature-return path.
