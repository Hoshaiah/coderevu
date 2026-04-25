## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Panic Closing Already-Closed Channel
// ------------------------------------------------------------------------

package broker

import "sync"

type Broker struct {
	done chan struct{}
	wg   sync.WaitGroup
	// CHANGE 1: add a Once so that only the first Shutdown call closes the channel; subsequent calls are safe no-ops.
	once sync.Once
}

func NewBroker() *Broker {
	return &Broker{done: make(chan struct{})}
}

func (b *Broker) Subscribe(id int, handle func(int)) {
	b.wg.Add(1)
	go func() {
		defer b.wg.Done()
		for {
			select {
			case <-b.done:
				return
			default:
				handle(id)
			}
		}
	}()
}

func (b *Broker) Shutdown() {
	// CHANGE 1: wrap close(b.done) in b.once.Do so concurrent callers cannot close an already-closed channel.
	b.once.Do(func() { close(b.done) })
	b.wg.Wait()
}
```

## Explanation

### Issue 1: Concurrent `close` on Same Channel

**Problem:** Two goroutines — the OS signal handler and the HTTP `/drain` handler — both call `Shutdown` when a drain request arrives at the same time as a SIGTERM. The second call reaches `close(b.done)` after the first has already closed it. Go's runtime panics immediately with `close of closed channel`, crashing the process.

**Fix:** A `sync.Once` field named `once` is added to `Broker`. Inside `Shutdown`, `close(b.done)` is moved into `b.once.Do(func() { close(b.done) })`. Every caller still proceeds to `b.wg.Wait()`, but the channel is closed exactly once regardless of how many goroutines race into `Shutdown`.

**Explanation:** `close` on a channel is not idempotent — calling it twice always panics, even if the second call happens a millisecond after the first. `sync.Once` serializes the close: the first goroutine to enter `Do` executes the closure; all others return immediately without executing it. Because `b.wg.Wait()` sits outside `Do`, every caller still blocks until all subscribers have exited, preserving the drain semantic. A related pitfall: if you tried to guard with a boolean flag and a plain `sync.Mutex`, you would need to hold the lock across both the flag check and the `close` call, otherwise a race window remains — `sync.Once` handles this correctly by design.

---

### Issue 2: Silent No-Op on Repeated Shutdown

**Problem:** After `once.Do` makes repeated calls safe, a second caller to `Shutdown` skips the `close` but still calls `b.wg.Wait()`. Because the WaitGroup counter is already zero after the first shutdown completed, `Wait` returns immediately. This is harmless in practice but means the second caller gets no signal that it did nothing, which can hide sequencing bugs during testing or future refactoring.

**Fix:** The current reference solution accepts this behavior as a deliberate trade-off: both callers block on `b.wg.Wait()` until workers drain, which is correct for the concurrent-shutdown scenario where the first caller may not have finished waiting yet. No additional code change is needed beyond CHANGE 1, because `Wait` on a zero counter is defined and safe in Go.

**Explanation:** `sync.WaitGroup.Wait` returns immediately when the internal counter is zero, which is the state after all subscriber goroutines have called `wg.Done()`. If the first `Shutdown` call has already reaped all workers, the second call's `Wait` returns in nanoseconds — not a panic, just a no-op. If the two calls race before workers finish, both block on `Wait` and both unblock once the counter hits zero, which is also correct. The key insight is that `Wait` is safe to call from multiple goroutines concurrently; only `close` on a channel is not.
