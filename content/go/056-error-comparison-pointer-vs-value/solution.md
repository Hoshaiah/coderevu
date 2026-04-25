## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Sentinel Error Never Matches
// ------------------------------------------------------------------------

package queue

import "errors"

// ErrQueueEmpty is returned when the queue has no items.
var ErrQueueEmpty = errors.New("queue is empty")

type Consumer struct{}

func (c *Consumer) Poll() error {
	empty := true // simulate empty queue check
	if empty {
		return newQueueEmptyError()
	}
	return nil
}

func newQueueEmptyError() error {
	// CHANGE 1: return the package-level sentinel directly instead of a new errors.New value so errors.Is matches by pointer identity
	return ErrQueueEmpty
}
```

## Explanation

### Issue 1: `errors.New` Creates Non-Equal Error Values

**Problem:** Every call to `newQueueEmptyError()` produces a brand-new error value via `errors.New("queue is empty")`. Even though the message is identical to `ErrQueueEmpty`, `errors.Is` compares by pointer identity for plain `*errors.errorString` values, so it always returns `false`. Callers never detect the empty-queue condition, and the fallback error-logging path fires on every poll during off-peak hours.

**Fix:** Replace `return errors.New("queue is empty")` in `newQueueEmptyError` with `return ErrQueueEmpty`, so the function returns the exact same pointer that callers compare against.

**Explanation:** `errors.New` allocates a new `*errorString` struct on every invocation. Two calls to `errors.New` with the same string produce two different pointers. `errors.Is` walks the error chain and checks each node with `==`; for `*errorString` there is no custom `Is` method, so equality is pure pointer comparison. Because the returned pointer is never the same as `ErrQueueEmpty`, the check fails unconditionally. Returning the sentinel variable directly means every caller gets the same pointer, and `errors.Is(err, ErrQueueEmpty)` returns `true`. A related pitfall: if you later need to attach context (e.g., a timestamp), use `fmt.Errorf("queue is empty at %s: %w", t, ErrQueueEmpty)` so the sentinel is wrapped and `errors.Is` can still unwrap and match it.
