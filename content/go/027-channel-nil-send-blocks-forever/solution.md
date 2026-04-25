## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Send on Nil Channel Deadlocks
// ------------------------------------------------------------------------

package fanout

type Broadcaster struct {
	subs []chan string
}

func NewBroadcaster(n int) *Broadcaster {
	subs := make([]chan string, n)
	for i := range subs {
		subs[i] = make(chan string, 1)
	}
	return &Broadcaster{subs: subs}
}

func (b *Broadcaster) Unsubscribe(index int) {
	b.subs[index] = nil
}

func (b *Broadcaster) Broadcast(msg string) {
	for _, ch := range b.subs {
		// CHANGE 1: skip nil channels explicitly — a send on a nil channel inside a select never becomes ready, so the default branch is never taken and the goroutine hangs forever.
		if ch == nil {
			continue
		}
		select {
		case ch <- msg:
		default:
			// subscriber full, drop message
		}
	}
}

func (b *Broadcaster) Sub(index int) <-chan string {
	return b.subs[index]
}
```

## Explanation

### Issue 1: nil channel send deadlocks select

**Problem:** After a subscriber calls `Unsubscribe`, its slot in `b.subs` is set to `nil`. The next call to `Broadcast` iterates over the slice and reaches that `nil` entry. A send to a `nil` channel inside a `select` statement never becomes ready — not even when a `default` branch is present — so the goroutine blocks forever, hanging the entire broadcast loop and every downstream subscriber.

**Fix:** A `nil` check (`if ch == nil { continue }`) is added at the top of the loop body in `Broadcast`, before the `select`. This is the `CHANGE 1` site. When the slot is `nil`, the iteration simply moves to the next subscriber.

**Explanation:** In Go, a receive from a `nil` channel blocks forever, and so does a send. Inside a `select`, each case is evaluated to determine whether it is ready. A send on a `nil` channel is never ready, so the runtime does not consider it selectable. You might expect the `default` branch to fire when all non-nil cases are blocked, but that only applies when there are no ready cases among the non-nil ones — the `nil` case does not count as "not ready"; it simply can never be ready, making the `select` behave as if that case were permanently blocked. Because there is exactly one case (the `nil` send) and one `default`, Go does execute `default` if the channel were full, but a `nil` channel is not "full" — it is in a permanently unready state and the scheduler will never unpark the goroutine waiting on it without a `default`. The critical detail: a buffered channel with no room triggers `default`; a `nil` channel triggers a deadlock. Skipping `nil` entries before entering the `select` removes the possibility entirely.

---

### Issue 2: Unsubscribed slots remain in the iteration

**Problem:** `Unsubscribe` sets `b.subs[index] = nil` but leaves the slice length unchanged. Every subsequent `Broadcast` call visits the slot. Without the `nil` guard added in Issue 1, this causes a hang. Even with the guard, silently iterating dead slots wastes cycles in high-subscriber scenarios and makes the intent of the code unclear.

**Fix:** The `CHANGE 1` guard (`if ch == nil { continue }`) also resolves this issue: nil slots are explicitly skipped on every iteration, so unsubscribed entries are treated as no-ops without modifying the slice structure.

**Explanation:** The design keeps the slice fixed-size and uses `nil` as a tombstone for removed subscribers. This is a valid pattern, but it requires every consumer of the slice to be aware of the tombstone convention. The `Broadcast` loop had no such awareness before the fix. Adding the explicit `nil` check makes the tombstone contract visible in code. A related pitfall: if you closed the channel instead of nilling the slot, a send on a closed channel panics rather than blocking — so `nil` is actually the safer tombstone value here, as long as every send site checks for it first.
