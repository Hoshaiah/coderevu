## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Done Channel Replaced Under Readers
// ------------------------------------------------------------------------

package broker

import "sync"

type Subscription struct {
	mu   sync.RWMutex
	ch   chan string
	// CHANGE 1: done is a separate broadcast channel closed on Reset so readers can detect channel replacement without holding ch.
	done chan struct{}
}

func NewSubscription() *Subscription {
	return &Subscription{
		ch:   make(chan string, 64),
		done: make(chan struct{}),
	}
}

// Subscribe returns the current event channel AND a done channel that is closed when this generation is invalidated.
// CHANGE 1: Callers now receive both ch and done so they can detect a Reset and re-subscribe instead of reading a dead channel.
func (s *Subscription) Subscribe() (<-chan string, <-chan struct{}) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.ch, s.done
}

// Publish sends an event to current subscribers.
// CHANGE 2: Use a select with default to avoid blocking forever when the buffer is full, and check done to avoid sending on a channel that Reset is about to close.
func (s *Subscription) Publish(event string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	select {
	case s.ch <- event:
	case <-s.done:
		// Reset has been called; this generation is gone, drop the event.
	}
}

// Reset closes the old channel, signals done, then installs a fresh channel and done pair.
// CHANGE 1: Close done BEFORE closing ch so that any Publish goroutine blocked in select sees done first and exits cleanly, preventing send-on-closed-channel.
func (s *Subscription) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	close(s.done)
	close(s.ch)
	s.ch = make(chan string, 64)
	s.done = make(chan struct{})
}
```

## Explanation

### Issue 1: Stale channel reference after Reset

**Problem:** A subscriber calls `Subscribe()` once, stores the returned channel, and then ranges over it. When `Reset()` closes that channel and installs a new one, the subscriber's local variable still points to the old, closed channel. It either exits its read loop immediately (closed channel drains then returns the zero value) or stops receiving altogether, so events published after the reset are silently lost.

**Fix:** `Subscribe()` now returns two values: the event channel `ch` and a `done` channel. `done` is closed by `Reset()` before the old `ch` is replaced. Callers select on both, and when `done` fires they call `Subscribe()` again to get the new generation.

**Explanation:** The root cause is that a channel value is just a pointer; handing it out and then replacing the struct field does nothing to the copies already in use. By pairing every generation of `ch` with a `done` sentinel, the subscriber can detect the moment the generation ends. Closing `done` before closing `ch` is intentional: any `Publish` goroutine blocking in `select { case s.ch <- event: case <-s.done: }` will pick the `done` arm and return cleanly instead of racing with the `close(s.ch)` call. If `done` were closed after `ch`, a tiny window exists where `Publish` could attempt to send on the already-closed `ch`.

---

### Issue 2: Publish sends on a closed or full channel

**Problem:** If `Publish` is called concurrently with `Reset`, it can send on the channel after `Reset` has called `close(s.ch)`, which panics with `send on closed channel`. Even without a race, if 64 events are already buffered, `Publish` blocks indefinitely while holding no lock or while another goroutine is waiting for the mutex.

**Fix:** `Publish` now uses `select { case s.ch <- event: case <-s.done: }` under an `RLock` instead of a bare send. The `done` arm lets `Publish` bail out when the generation is being torn down, eliminating the panic. `RLock` (rather than a full `Lock`) allows multiple `Publish` calls to proceed concurrently; only `Reset` takes the write lock.

**Explanation:** A bare `s.ch <- event` has two failure modes here. First, once `Reset` calls `close(s.ch)`, any concurrent `Publish` that already read `s.ch` but hasn't sent yet will panic. Second, a full buffer causes `Publish` to block indefinitely, stalling the broker for all callers. The `select` with a `done` case solves the first problem by giving `Publish` an escape hatch the moment `Reset` signals. Switching to `sync.RWMutex` and using `RLock` in `Publish` solves a secondary contention issue: many publishers no longer serialize against each other, only against `Reset`.
