## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Context cancellation leak causes goroutines to accumulate over time
// ------------------------------------------------------------------------
package worker

import (
	"context"
	"time"
)

type Job struct{ ID int }

func pollOnce(parent context.Context, fetch func(context.Context) ([]Job, error)) ([]Job, error) {
	// CHANGE 1: capture and defer the cancel function returned by WithTimeout. Discarding it (using _ ) means the internal timer goroutine runs until the timeout fires, even when fetch returns early. Over thousands of calls this accumulates many leaked goroutines and their associated resources.
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	return fetch(ctx)
}

func RunWorker(ctx context.Context, fetch func(context.Context) ([]Job, error)) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			jobs, err := pollOnce(ctx, fetch)
			if err != nil || len(jobs) == 0 {
				continue
			}
			for _, j := range jobs {
				process(j)
			}
		}
	}
}

func process(j Job) {}
```

## Explanation

### Issue 1: Discarded cancel leaks timer goroutine

**Problem:** Every call to `pollOnce` creates a child context via `context.WithTimeout`, but the returned `cancel` function is thrown away with `_`. The Go runtime keeps an internal goroutine alive to fire the timeout. If `fetch` returns in, say, 50 ms, that goroutine still lives for the remaining ~4.95 seconds. With a 10-second tick interval the leak is mild at first, but after hours of continuous polling the leaked goroutines accumulate and memory climbs steadily.

**Fix:** Replace `ctx, _ :=` with `ctx, cancel :=` and add `defer cancel()` immediately after, as shown at the `CHANGE 1` site. This ensures the timer is released as soon as `pollOnce` returns regardless of whether `fetch` completed early or the timeout actually fired.

**Explanation:** `context.WithTimeout` calls `time.AfterFunc` internally, which spawns a goroutine that waits for the deadline. The only way to release that goroutine before the deadline is to call the cancel function. When cancel is assigned to `_`, Go discards it immediately — there is no other handle to it. Each leaked timer goroutine also holds a reference to the child context struct, preventing GC of any values stored in it. `defer cancel()` runs at function return, which is the earliest safe moment: the child context is no longer needed after `fetch` returns. A related pitfall is calling `cancel()` before `fetch` finishes, which would cancel the context the fetch is actively using — `defer` avoids that by running after the return value is already captured.

---
