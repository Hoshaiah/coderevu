## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Background Context Loses Cancellation
// ------------------------------------------------------------------------

package thumbnail

import (
	"context"
	"fmt"
	"time"
)

type Image struct{ Data []byte }

func encode(ctx context.Context, img Image) ([]byte, error) {
	// simulates CPU-bound encoding that checks ctx periodically
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(200 * time.Millisecond):
		return img.Data, nil
	}
}

func GenerateThumbnail(ctx context.Context, img Image) ([]byte, error) {
	// CHANGE 1: derive the timeout context from the incoming ctx, not context.Background(), so parent cancellation (e.g. HTTP request disconnect) propagates into this context and stops the goroutine.
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	type result struct {
		data []byte
		err  error
	}

	ch := make(chan result, 1)
	go func() {
		// CHANGE 2: ctx is now derived from the parent, so encode observes parent cancellation and returns promptly instead of running until the 5-second local timeout expires.
		data, err := encode(ctx, img)
		ch <- result{data, err}
	}()

	select {
	case r := <-ch:
		return r.data, r.err
	case <-ctx.Done():
		return nil, fmt.Errorf("thumbnail: %w", ctx.Err())
	}
}
```

## Explanation

### Issue 1: Parent context ignored at derivation

**Problem:** When a client disconnects, the HTTP server cancels the request context. `GenerateThumbnail` receives that context as `ctx`, but immediately throws it away by calling `context.WithTimeout(context.Background(), 5*time.Second)`. The new context has no parent relationship with the request context, so the cancellation signal never reaches any code that uses the derived `ctx`.

**Fix:** Replace `context.Background()` with the incoming `ctx` argument in the `context.WithTimeout` call, so the line reads `ctx, cancel := context.WithTimeout(ctx, 5*time.Second)`.

**Explanation:** `context.WithTimeout` creates a child of whatever context you pass as the first argument. A child context is cancelled when its parent is cancelled, or when its own deadline fires — whichever comes first. By passing `context.Background()` you create an orphan: it has a 5-second deadline of its own, but no link back to the request lifecycle. Passing the incoming `ctx` instead makes the new context a true child: if the HTTP request is cancelled at any point before the 5-second deadline, the child context is cancelled immediately too. A related pitfall is doing the same thing inside middleware or helper functions that accept a context — always derive from the passed-in context, never from `context.Background()`, unless you explicitly want a context that outlives the caller.

---

### Issue 2: Goroutine not stopped on parent cancellation

**Problem:** Even after the `select` in `GenerateThumbnail` exits via `ctx.Done()`, the goroutine running `encode` continues until its own `ctx` expires (up to 5 seconds, since that `ctx` is rooted at `context.Background()`). Under high client-disconnect rates this causes goroutine count to grow unboundedly, with each leaked goroutine holding memory and a timer.

**Fix:** The fix is the same code change at CHANGE 2 — because `ctx` is now derived from the parent (Issue 1 fix), the goroutine's call to `encode(ctx, img)` observes parent cancellation through the same context and returns promptly when `ctx.Done()` closes.

**Explanation:** `encode` does a `select` on `ctx.Done()`, so it will stop early only if the context it receives is cancelled. Before the fix, the goroutine's `ctx` was the orphaned one rooted at `context.Background()`, which is never cancelled by the parent. After the fix, `ctx` is the child of the request context, so when the request is cancelled the child's `Done` channel closes, `encode` returns the error, and the goroutine exits cleanly. The buffered channel `ch` (capacity 1) ensures the goroutine can always send its result without blocking, even if `GenerateThumbnail` has already returned — this part was already correct and no change is needed there.
