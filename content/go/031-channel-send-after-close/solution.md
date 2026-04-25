## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Send on Closed Channel Panic
// ------------------------------------------------------------------------

package pipeline

import (
	"context"
	"fmt"
	"sync"
)

func RunWorkers(ctx context.Context, n int) error {
	// CHANGE 1: Buffer size stays n so every worker can send without blocking, but we never close errc explicitly — we use a WaitGroup to know when all workers are done and then close safely.
	errc := make(chan error, n)

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		i := i
		go func() {
			// CHANGE 1: Decrement the WaitGroup when the worker exits so the closer goroutine knows it is safe to close errc.
			defer wg.Done()
			if err := doWork(ctx, i); err != nil {
				errc <- fmt.Errorf("worker %d: %w", i, err)
			}
		}()
	}

	// CHANGE 1: Close errc only after every worker has finished sending, eliminating the send-on-closed-channel race.
	go func() {
		wg.Wait()
		close(errc)
	}()

	// CHANGE 2: Range over errc instead of counting n receives; this naturally stops when the channel is closed and drained, so we never block waiting for workers that succeeded and sent nothing.
	for err := range errc {
		if err != nil {
			return err
		}
	}
	return nil
}

func doWork(ctx context.Context, id int) error { return nil }
```

## Explanation

### Issue 1: Closing channel while workers still send

**Problem:** When two or more workers fail at nearly the same time, the first error received causes `close(errc)` to be called inside the receive loop. Any worker that then tries to execute `errc <- err` hits a closed channel and the runtime panics with `send on closed channel`. This is intermittent because it only triggers when the channel close races with a concurrent send.

**Fix:** Remove the `close(errc)` call from the receive loop. Instead, add a `sync.WaitGroup` that each worker decrements via `defer wg.Done()`. A dedicated closer goroutine calls `wg.Wait()` and only then calls `close(errc)`, guaranteeing no worker is still running when the channel is closed.

**Explanation:** The root cause is that `close` is called from the consumer side while producers (workers) are still alive. Go's channel contract says sending to a closed channel always panics — there is no "safe send" built in. By tying the close to `wg.Wait()`, the close happens strictly after the last possible send. The WaitGroup counter reaches zero only after every goroutine has returned, so by the time `close(errc)` executes, no goroutine can send on `errc` anymore. The buffered channel (size `n`) ensures that workers which error can send without blocking even if the consumer is slow.

---

### Issue 2: Early return leaves goroutines blocked or panicking

**Problem:** The original receive loop runs exactly `n` iterations and does `close(errc)` then `return err` on the first non-nil error. Workers that haven't errored yet have nowhere to send if the channel is already closed (panic) or if the consumer has returned and nobody ever reads their value (goroutine leak if the buffer is full).

**Fix:** Replace the counted `for i := 0; i < n; i++` loop with `for err := range errc`. The `range` loop reads until the channel is both closed and empty, and the closer goroutine (from CHANGE 1) closes the channel only after all workers finish, so the loop exits cleanly after processing every error that was actually sent.

**Explanation:** The old loop assumed every worker sends exactly one value — but workers only send when they encounter an error. A worker that succeeds sends nothing, so the loop would block forever waiting for a value that never arrives if fewer than `n` workers fail. Worse, returning early mid-loop means subsequent successful or failing workers find either a closed channel or a full buffer with no reader. Using `range` decouples the consumer from the exact number of sends: it keeps reading until the channel signals it is done (via close), which is exactly what the WaitGroup-based closer provides.
