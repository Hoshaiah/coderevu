## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Concurrent Senders Race on Close
// ------------------------------------------------------------------------

package pipeline

import (
	"sync"
)

type Item struct{ Value int }

func FanIn(workers []func() Item) <-chan Item {
	out := make(chan Item)
	var wg sync.WaitGroup

	for _, w := range workers {
		wg.Add(1)
		w := w
		go func() {
			defer wg.Done()
			out <- w()
		}()
	}

	// CHANGE 1: moved close(out) into a supervisor goroutine so it no longer runs before workers send.
	// CHANGE 2: wg.Wait() is now the gate that blocks the supervisor until every worker has called wg.Done(), then closes the channel.
	go func() {
		wg.Wait()
		close(out)
	}()

	return out
}
```

## Explanation

### Issue 1: `close` called before workers send

**Problem:** The original code calls `close(out)` on the main goroutine immediately after launching all worker goroutines, before any of them have had a chance to execute. When a worker then tries to send on `out`, the channel is already closed and the runtime panics with `send on closed channel`.

**Fix:** `close(out)` is moved inside the supervisor goroutine (the `go func()` block), right after `wg.Wait()` returns. It no longer appears on the main goroutine at all.

**Explanation:** Goroutine scheduling is non-deterministic. Calling `close(out)` on the main goroutine races with every worker's `out <- w()` send. With one worker the race window is tiny and usually goes unnoticed; with eight or more workers the probability that at least one worker is pre-empted between launch and send rises sharply, so the panic becomes reproducible under load. Moving `close` after `wg.Wait()` inside the supervisor goroutine means the channel is only closed after every worker has already finished sending and decremented the `WaitGroup` counter.

---

### Issue 2: `wg.Wait()` had no effect on channel lifetime

**Problem:** In the buggy code, `wg.Wait()` lived inside a goroutine that did nothing after returning — it never called `close(out)`. So the only `close` call was the one on the main goroutine, which ran unconditionally and immediately.

**Fix:** `close(out)` is placed immediately after `wg.Wait()` inside the same supervisor goroutine, making the wait and the close a single atomic sequence of events within that goroutine.

**Explanation:** A `sync.WaitGroup` only provides synchronization if code that depends on completion actually blocks on `wg.Wait()`. The original supervisor goroutine waited for workers but then discarded the result — nothing downstream observed that the wait had completed. Putting `close(out)` directly after `wg.Wait()` in the same goroutine means the channel is closed exactly once, and only after the counter reaches zero, which happens only after every worker's `defer wg.Done()` has executed — guaranteeing no worker can send after the close.
