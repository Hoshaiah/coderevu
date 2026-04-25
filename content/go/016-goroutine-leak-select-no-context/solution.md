## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Leaks Without Context Check
// ------------------------------------------------------------------------

package poller

import (
	"context"
	"time"
)

type Status struct {
	Done   bool
	Result string
}

func fetchStatus(jobID string) (Status, error) {
	// calls remote API
	return Status{}, nil
}

func PollUntilDone(ctx context.Context, jobID string, interval time.Duration) (Status, error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// CHANGE 2: buffer of 1 so the goroutine can send and exit even if the select has already chosen ctx.Done().
	resultCh := make(chan Status, 1)

	go func() {
		for {
			select {
			// CHANGE 3: check ctx.Done() inside the goroutine so it exits promptly when the context is cancelled.
			case <-ctx.Done():
				return
			case <-ticker.C:
				status, err := fetchStatus(jobID)
				if err != nil {
					continue
				}
				if status.Done {
					// CHANGE 1: non-blocking send; with a buffered channel of 1 this always succeeds and the goroutine does not block when there is no receiver.
					resultCh <- status
					return
				}
			}
		}
	}()

	select {
	case status := <-resultCh:
		return status, nil
	case <-ctx.Done():
		return Status{}, ctx.Err()
	}
}
```

## Explanation

### Issue 1: Goroutine blocks on unbuffered send

**Problem:** When the context is cancelled, `PollUntilDone` returns via the `ctx.Done()` arm of the `select`. The background goroutine eventually calls `resultCh <- status`, but there is no receiver left. The goroutine blocks on that send indefinitely, keeping the goroutine and the closure's variables alive forever.

**Fix:** `resultCh` is created with a buffer of 1 (`make(chan Status, 1)` at the CHANGE 2 site). The send at the CHANGE 1 site can then complete immediately regardless of whether a receiver is present.

**Explanation:** An unbuffered channel requires both sender and receiver to be ready at the same time. After `PollUntilDone` returns, the receiver is gone. The goroutine reaches `resultCh <- status` and parks there with no way to proceed. Giving the channel a buffer of 1 means the goroutine deposits the value and exits even when the caller is no longer listening. Because only one result is ever needed, a buffer of 1 is sufficient and does not change observable behaviour when the context has not been cancelled.

---

### Issue 2: `resultCh` is unbuffered, enabling the blocking send

**Problem:** The root structural cause of the leak is that `resultCh` is created with zero capacity. This pairs with issue 1 to produce the hang: every successful poll that finds `status.Done == true` risks blocking if the timing aligns with a context cancellation.

**Fix:** The channel declaration is changed to `make(chan Status, 1)` at the CHANGE 2 site, giving it capacity for one value.

**Explanation:** With an unbuffered channel the send and receive must rendezvous. In the happy path this works because the `select` in `PollUntilDone` is waiting. In the cancellation path, the `select` picks `ctx.Done()` and returns before the goroutine reaches its send, so there is no rendezvous partner. A buffer of 1 decouples the two: the goroutine sends and moves on without needing the caller to be present. One subtle point: even with the buffer, the goroutine must also check `ctx.Done()` (issue 3) to stop polling after cancellation; the buffer alone only prevents the final send from blocking.

---

### Issue 3: Background goroutine ignores context cancellation

**Problem:** The original goroutine loops over `ticker.C` with no awareness of the context. After the caller's context is cancelled, the goroutine keeps firing `fetchStatus` on every tick, consuming network connections and goroutine stack memory until the job eventually finishes — which may never happen if the job ID is stale or the remote API is slow.

**Fix:** The `for range ticker.C` loop is replaced with a `for` loop containing a `select` on both `ctx.Done()` and `ticker.C` at the CHANGE 3 site. When `ctx.Done()` fires, the goroutine returns immediately.

**Explanation:** `ticker.C` is a Go channel; the goroutine can only stop receiving from it by also listening on a done signal in the same `select`. Without this, `ticker.Stop()` in the deferred call does stop future ticks from being generated, but `ticker.Stop()` does not close the channel — the goroutine is already parked waiting for the next tick and will receive it if one was queued before `Stop` ran. Adding `ctx.Done()` as an alternative case in the `select` means cancellation wakes the goroutine on the next iteration at most, rather than leaving it spinning for the lifetime of the job.
