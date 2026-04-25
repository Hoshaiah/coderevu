## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Timer Reset Race Condition
// ------------------------------------------------------------------------

package session

import (
	"sync"
	"time"
)

type SessionTimer struct {
	timer    *time.Timer
	onExpire func()
	// CHANGE 2: add a mutex so concurrent Reset calls cannot interleave their Stop/Reset pairs
	mu sync.Mutex
}

func NewSessionTimer(timeout time.Duration, onExpire func()) *SessionTimer {
	st := &SessionTimer{onExpire: onExpire}
	st.timer = time.AfterFunc(timeout, onExpire)
	return st
}

func (st *SessionTimer) Reset(timeout time.Duration) {
	// CHANGE 2: lock around the entire Stop+Reset sequence so two goroutines cannot race
	st.mu.Lock()
	defer st.mu.Unlock()
	// CHANGE 1: drain the channel when Stop reports the timer had already fired, preventing a stale expiry from firing after Reset
	if !st.timer.Stop() {
		select {
		case <-st.timer.C:
		default:
		}
	}
	st.timer.Reset(timeout)
}
```

## Explanation

### Issue 1: Stale Expiry Fires After Reset

**Problem:** A session that is actively being used occasionally triggers the `onExpire` callback. The user sees "session expired" log lines for connections that have had recent activity, causing spurious disconnections under load.

**Fix:** After calling `st.timer.Stop()`, check its return value. If `Stop` returns `false`, the timer has already fired and its channel may hold a value; drain it with a non-blocking receive on `st.timer.C` before calling `st.timer.Reset(timeout)`. This is the pattern the Go standard library documents for safe timer reuse.

**Explanation:** `time.AfterFunc` creates a timer that sends on an internal channel when it fires. `Stop` returns `false` when the timer has already fired — meaning the expiry goroutine is about to run or has already queued. If you call `Reset` without draining the channel first, the old expiry signal is still pending. The next time the timer fires *legitimately*, both the stale and the new expiry events may be delivered, or the callback runs when it should not. Draining the channel after a failed `Stop` discards the stale event and leaves the timer in a clean state for `Reset`. Note: this drain is only safe to do before `Reset` is called and must be paired with the mutex from Issue 2 to avoid a new race.

---

### Issue 2: Unprotected Concurrent Reset Calls

**Problem:** Two goroutines call `Reset` at the same time. Their `Stop` and `Reset` calls interleave arbitrarily, so one goroutine may call `Reset` after the other has already called `Stop` but before it calls `Reset`, causing an extra timer restart or a missed drain. The result is the same false expiry symptom, invisible to `go test -race` because no variable is accessed without a lock — the bug is in control-flow ordering, not memory access.

**Fix:** Add a `sync.Mutex` field `mu` to `SessionTimer` and lock it at the top of `Reset` with `st.mu.Lock()` / `defer st.mu.Unlock()`, wrapping the entire `Stop`-drain-`Reset` sequence.

**Explanation:** `go test -race` instruments memory reads and writes. It does not model the ordering of operations across goroutines when no shared variable is read or written unsafely. Here, `st.timer` is always written by the constructor and then only read (the pointer itself does not change), so the race detector sees nothing wrong. But the sequence `Stop → drain → Reset` must be atomic as a unit: if goroutine A stops the timer and goroutine B also stops it and drains the channel before A does, A's drain blocks forever or A's `Reset` fires immediately because the channel is already empty. The mutex serializes the three-step sequence so each caller gets a consistent view of the timer state.
