## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Send Blocks When Receiver Is Gone
// ------------------------------------------------------------------------

package notify

type Dispatcher struct {
	subscribers []chan string
}

func (d *Dispatcher) Register() chan string {
	ch := make(chan string, 1)
	d.subscribers = append(d.subscribers, ch)
	return ch
}

func (d *Dispatcher) Broadcast(msg string) {
	for _, ch := range d.subscribers {
		// CHANGE 1: use a non-blocking select/default so that a full or unread channel is skipped instead of blocking the dispatcher forever.
		select {
		case ch <- msg:
		default:
		}
	}
}

func (d *Dispatcher) Unregister(ch chan string) {
	for i, sub := range d.subscribers {
		if sub == ch {
			d.subscribers = append(d.subscribers[:i], d.subscribers[i+1:]...)
			// CHANGE 2: close the channel after removing it so any goroutine blocked on a receive from this channel unblocks immediately instead of leaking.
			close(ch)
			return
		}
	}
}
```

## Explanation

### Issue 1: Blocking Send Hangs Dispatcher

**Problem:** When an HTTP handler disconnects without reading from its channel, the buffered channel (capacity 1) stays full. The next `Broadcast` call reaches that channel and the line `ch <- msg` blocks forever. Because `Broadcast` iterates subscribers in a single goroutine, every subsequent subscriber also stops receiving notifications until the process is restarted.

**Fix:** Replace the bare `ch <- msg` send with a `select` statement containing `case ch <- msg:` and an empty `default:` branch. This is the CHANGE 1 site in `Broadcast`.

**Explanation:** A buffered channel of size 1 absorbs exactly one unread message. The moment that slot is occupied and no receiver drains it, any further send blocks the calling goroutine. There is no implicit timeout on a channel send in Go. Wrapping the send in a `select` with a `default` makes the operation non-blocking: if the channel cannot accept the message right now, the `default` arm executes and the loop continues to the next subscriber. The trade-off is that a slow or disconnected subscriber silently drops the message, which is the correct behaviour for a fire-and-forget notification system. If message delivery guarantees are needed later, the `default` arm is the right place to log a drop or enqueue a retry.

---

### Issue 2: Unregister Leaks Subscriber Goroutines

**Problem:** When `Unregister` removes a channel from the slice it does not close the channel. Any goroutine that is blocked on `<-ch` waiting for a notification will remain parked in that receive indefinitely, because no sender will ever write to the channel again and the channel is never signalled as done.

**Fix:** Add `close(ch)` immediately after the slice removal inside `Unregister`. This is the CHANGE 2 site.

**Explanation:** In Go, receiving from a closed channel returns the zero value immediately rather than blocking. A goroutine sitting on `msg := <-ch` will therefore wake up and can detect the closure with the two-value form `msg, ok := <-ch` where `ok` is `false`. Without the close, the goroutine has no way to learn that nobody will ever send again, so it stays alive, holding its stack memory and any resources it references. Closing the channel is safe here because `Unregister` removes it from the slice first, guaranteeing that `Broadcast` will never attempt to send to it again after the close, which would cause a panic.
