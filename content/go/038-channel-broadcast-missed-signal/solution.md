## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Broadcast on Unbuffered Notification Channel
// ------------------------------------------------------------------------

package cache

import "sync"

type Invalidator struct {
	mu   sync.Mutex
	subs []chan struct{}
}

func (inv *Invalidator) WaitForInvalidation() {
	// CHANGE 1: buffered channel of size 1 so publish can send without blocking, even if this goroutine is not yet receiving.
	ch := make(chan struct{}, 1)
	inv.mu.Lock()
	inv.subs = append(inv.subs, ch)
	inv.mu.Unlock()
	<-ch
}

// publish is called by the Redis listener goroutine.
func (inv *Invalidator) publish() {
	inv.mu.Lock()
	subs := inv.subs
	inv.subs = nil
	inv.mu.Unlock()

	for _, ch := range subs {
		// CHANGE 2: non-blocking send so all subscribers are unblocked immediately without serialising on each one being scheduled.
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
```

## Explanation

### Issue 1: Unbuffered Channel Blocks Sender

**Problem:** Every `WaitForInvalidation` caller creates an unbuffered channel. A send on an unbuffered channel blocks until the receiver executes the receive. If any waiting goroutine has been cancelled, preempted, or not yet scheduled, `publish` hangs on that goroutine's channel send and never reaches the remaining subscribers.

**Fix:** Replace `make(chan struct{})` with `make(chan struct{}, 1)` at the `CHANGE 1` site. The buffer of 1 lets `publish` deposit the signal and move on without waiting for the receiver to be scheduled.

**Explanation:** With an unbuffered channel, the sender and receiver must rendezvous simultaneously. In `publish`, the loop calls `ch <- struct{}{}` for each subscriber in turn. If subscriber N is not currently blocked on `<-ch` (perhaps it was preempted, or its HTTP request context was cancelled), the send stalls. All subscribers after N in the slice never receive the signal during that invalidation event, so their `WaitForInvalidation` calls block until the next event — or forever. A buffer of 1 decouples the sender from each receiver's scheduling state: `publish` places the value in the buffer and continues immediately, and the receiver picks it up whenever it next runs.

---

### Issue 2: Serial Notification Delays Late Subscribers

**Problem:** Even without a full block, the original loop notifies subscribers one at a time. Under load with hundreds of waiting HTTP handlers, the last handler in the slice is notified only after every earlier handler has both received and returned from its receive, introducing measurable latency that makes stale-data symptoms appear intermittent.

**Fix:** Replace the direct send `ch <- struct{}{}` with a `select` containing a send case and a `default` case at the `CHANGE 2` site. Because the channel is now buffered (CHANGE 1), the send case succeeds immediately for every subscriber, and `default` only fires if a duplicate signal was somehow already deposited.

**Explanation:** The `select`-with-`default` pattern performs a non-blocking send. Combined with the buffered channel from CHANGE 1, it lets the loop iterate over all subscribers as fast as the CPU allows, depositing one signal into each buffer without waiting for any goroutine to wake up. Each subscriber then drains its own channel independently whenever it is scheduled. The `default` branch also acts as a safety valve: if `publish` were called twice in rapid succession before a subscriber drains its channel, the second send would be dropped rather than panicking or blocking, keeping the loop safe under any re-entrancy scenario.
