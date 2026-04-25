## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Send Races With Context Cancel
// ------------------------------------------------------------------------

package search

import (
	"context"
	"errors"
)

type ShardResult struct {
	Shard int
	Data  string
}

func queryBackend(ctx context.Context, shard int) (ShardResult, error) {
	// real implementation calls an HTTP endpoint
	return ShardResult{}, errors.New("not implemented")
}

func FirstResult(ctx context.Context, shards []int) (ShardResult, error) {
	// CHANGE 1: buffer resultCh with len(shards) so every goroutine can send without blocking even after the caller has returned, preventing goroutine leaks.
	resultCh := make(chan ShardResult, len(shards))
	errCh := make(chan error, len(shards))

	for _, s := range shards {
		go func(shard int) {
			res, err := queryBackend(ctx, shard)
			if err != nil {
				errCh <- err
				return
			}
			resultCh <- res
		}(s)
	}

	// CHANGE 2: track error count separately so we keep looping until we see a result, exhaust all shards, or the context is cancelled, regardless of arrival order.
	errCount := 0
	for errCount < len(shards) {
		select {
		case res := <-resultCh:
			return res, nil
		case <-errCh:
			errCount++
		case <-ctx.Done():
			return ShardResult{}, ctx.Err()
		}
	}
	return ShardResult{}, errors.New("all shards failed")
}
```

## Explanation

### Issue 1: Unbuffered result channel blocks goroutines

**Problem:** When one shard succeeds and `FirstResult` returns, the goroutines from the remaining shards that also succeed have nowhere to send their result — `resultCh` is unbuffered and nobody is reading it anymore. Those goroutines park on the channel send indefinitely, leaking for the lifetime of the process. Under load, leaked goroutines accumulate, and their held resources (connections, memory) grow until the next request's context timeout fires.

**Fix:** `resultCh` is created with `make(chan ShardResult, len(shards))` instead of `make(chan ShardResult)`. Every goroutine can now complete its send and exit even if the caller has already returned.

**Explanation:** A channel send blocks until a receiver is ready. Once `FirstResult` returns on the happy path, there is no receiver left for `resultCh`. Any goroutine that finishes after that point stalls forever on `resultCh <- res`. Buffering the channel with capacity equal to the number of shards guarantees that every goroutine can send exactly once without blocking. The same pattern already existed on `errCh` — `resultCh` simply needed the same treatment. A related pitfall: if you buffer with a smaller capacity than `len(shards)`, you still leak goroutines when more senders arrive than slots available.

---

### Issue 2: Loop bound skips result when errors arrive first

**Problem:** The original loop runs exactly `len(shards)` iterations using `for range shards`. Each iteration consumes one item from either channel. If several errors arrive before the successful result, those iterations each drain one error, but the loop exits after `len(shards)` total iterations regardless of whether a result was ever seen. A 3-shard scenario where all three respond (2 errors then 1 success) completes the loop after 3 iterations — but if by scheduling chance the `select` picks the error branch twice and then the context branch once, the result is dropped entirely and the function falls through to `"all shards failed"`.

**Fix:** Replace `for range shards` with `for errCount < len(shards)` and increment `errCount` only in the error case. The loop now continues until the number of observed errors equals the total shard count, or until an early return (success or context cancellation) fires.

**Explanation:** `for range shards` counts select iterations, not errors. One iteration might consume a result (returning immediately) or an error (continuing), but the loop has no way to distinguish. If the first `len(shards)` select picks all turn out to be errors or context signals, a result that arrived slightly later is never read. Counting errors explicitly decouples loop progress from the arrival of results. The loop terminates naturally only when every shard has reported an error, which is the only condition under which `"all shards failed"` is the correct answer.
