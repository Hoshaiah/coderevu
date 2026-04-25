## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Leak on Blocking Send
// ------------------------------------------------------------------------

package notify

import "sync"

type Result struct {
	SubscriberID string
	Err          error
}

func Fanout(subscribers []string, send func(string) error) []Result {
	// CHANGE 1: Buffer the channel with len(subscribers) so every goroutine can send without blocking, preventing goroutine leaks even if the collector exits early.
	resultCh := make(chan Result, len(subscribers))
	var wg sync.WaitGroup

	for _, id := range subscribers {
		wg.Add(1)
		go func(sub string) {
			defer wg.Done()
			err := send(sub)
			resultCh <- Result{SubscriberID: sub, Err: err}
		}(id)
	}

	go func() {
		wg.Wait()
		close(resultCh)
	}()

	var results []Result
	for r := range resultCh {
		results = append(results, r)
	}
	return results
}
```

## Explanation

### Issue 1: Unbuffered Channel Blocks Worker Goroutines

**Problem:** Under load, worker goroutines pile up and are never released. The `runtime.NumGoroutine()` metric climbs without bound and RSS grows until the process is OOM-killed. A restart recovers it temporarily because all state is wiped.

**Fix:** Replace `make(chan Result)` with `make(chan Result, len(subscribers))` at the `resultCh` declaration. This gives the channel enough buffer slots so every worker can complete its send without waiting for the receiver.

**Explanation:** An unbuffered channel requires both the sender and the receiver to be ready at the same time. Each worker goroutine calls `resultCh <- Result{...}` and then blocks until the main goroutine's `for r := range resultCh` loop reads that slot. In the normal path this works fine, but consider any scenario where the receiver is slower than the producers or where a future code change causes the loop to exit early (a `return`, a `break`, a panic-recover, etc.): every in-flight worker goroutine gets stuck permanently on the channel send because nothing is draining it. The `wg.Wait()` goroutine also stays alive because `wg.Done()` is deferred after the send, so it never fires. Buffering the channel to `len(subscribers)` means each worker can deposit its result and exit regardless of when the consumer reads, eliminating the blocking condition entirely. One related pitfall: if `send()` itself can panic, you should wrap it in a recover to ensure `wg.Done()` still fires and the closer goroutine is not also leaked.

---
