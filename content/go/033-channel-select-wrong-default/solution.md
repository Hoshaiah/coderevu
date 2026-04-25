## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Missed Signal Due to Wrong Select
// ------------------------------------------------------------------------

package worker

import "time"

func Run(done <-chan struct{}, dequeue func() (string, bool)) {
	for {
		select {
		case <-done:
			return
		default:
		}

		item, ok := dequeue()
		if !ok {
			// CHANGE 2: Replace time.Sleep with a select that also listens on done, so a shutdown signal received while the queue is empty wakes the goroutine immediately instead of waiting up to 100ms.
			select {
			case <-done:
				return
			case <-time.After(100 * time.Millisecond):
			}
			continue
		}

		process(item)
	}
}

func process(item string) { /* ... */ }
```

## Explanation

### Issue 1: Non-blocking done check misses signals during sleep

**Problem:** The `select` with a `default` case at the top of the loop is non-blocking — it only notices a closed `done` channel if the goroutine happens to be executing that exact line. On a lightly-loaded system the goroutine spends nearly all of its time inside `time.Sleep`, so the check at the top of the loop runs at most once per 100ms, and even then only after the sleep returns.

**Fix:** This issue is resolved by CHANGE 2: replacing `time.Sleep(100 * time.Millisecond)` with a `select` that has a `case <-done: return` alongside `case <-time.After(100 * time.Millisecond)`. The top-of-loop non-blocking check is retained as a fast path for the case where done is already closed before the goroutine tries to dequeue.

**Explanation:** A `select` with a `default` case never blocks; if `done` is not ready at that instant it falls through immediately. The goroutine then calls `dequeue()`, gets nothing back, and enters `time.Sleep`. Go's runtime has no way to interrupt a sleeping goroutine from the outside — `time.Sleep` simply parks the goroutine on a timer and resumes it after the duration. Any channel signal that arrives during the sleep is queued but not acted on. After the sleep the goroutine loops back to the top, does the non-blocking check, and only then exits — adding up to 100ms of latency per iteration. In a lightly-loaded system where the queue is almost always empty, the goroutine is almost always sleeping, so `goleak` times out waiting for it.

---

### Issue 2: time.Sleep blocks shutdown on empty queue

**Problem:** When `dequeue` returns `ok == false`, the code calls `time.Sleep(100 * time.Millisecond)` unconditionally. The goroutine cannot react to `done` during that sleep. In the integration test the queue is empty, so the goroutine is perpetually sleeping and the shutdown signal is never processed within the 500ms window.

**Fix:** CHANGE 2 replaces `time.Sleep(100 * time.Millisecond)` with a `select { case <-done: return; case <-time.After(100 * time.Millisecond): }`. This keeps the same polling interval when the queue is empty but allows an immediate exit if `done` is closed during the wait.

**Explanation:** `time.After` returns a channel that receives after the duration, which lets `select` treat the timeout as just another channel event. When `done` is closed, the Go scheduler unblocks the `select` on the `case <-done` arm and the function returns — no waiting until the timer fires. The idle polling delay is preserved for the normal case. A related pitfall: each call to `time.After` allocates a timer that is not garbage-collected until it fires, so in a very tight loop this can leak memory; for a 100ms poll interval it is negligible, but callers with sub-millisecond intervals should use `time.NewTimer` and reset it manually.
