## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Semaphore Channel Causes Deadlock
// ------------------------------------------------------------------------

package crawler

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

const maxConcurrent = 4

var sem = make(chan struct{}, maxConcurrent)

func fetch(ctx context.Context, url string) ([]byte, error) {
	// CHANGE 1: Use a select so that a pre-cancelled context causes an immediate return instead of blocking forever on the semaphore send.
	select {
	case sem <- struct{}{}:
		// acquired
	case <-ctx.Done():
		return nil, fmt.Errorf("acquire semaphore: %w", ctx.Err())
	}
	// CHANGE 2: Release is a receive from sem (consuming a slot back), which is correct for this send-to-acquire / receive-to-release semaphore idiom — added explicit comment for clarity; no logic change needed here because the original receive-to-release was actually correct.
	defer func() { <-sem }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	return body, nil
}
```

## Explanation

### Issue 1: Unconditional semaphore acquire blocks cancelled goroutines

**Problem:** When a goroutine calls `fetch` with a context that is already cancelled (e.g. because the parent crawl was aborted), the line `sem <- struct{}{}` blocks until a slot opens up. If all four slots are occupied by other goroutines, the cancelled goroutine parks on the channel send indefinitely. Because those other goroutines may themselves be waiting or slow, the whole system stalls — CPU drops to zero and no further progress is made.

**Fix:** Replace the bare `sem <- struct{}{}` send with a `select` statement that also listens on `ctx.Done()`. When the context is already cancelled, the `<-ctx.Done()` case fires immediately and `fetch` returns a wrapped `ctx.Err()` error without touching the semaphore.

**Explanation:** A buffered channel used as a semaphore works by blocking the sender when the buffer is full. That blocking is intentional for normal callers, but it becomes a problem for callers whose context is already done — they are not supposed to do any work, yet they still park on the channel. A `select` with `ctx.Done()` makes the acquire non-blocking under cancellation: if the context is done, the goroutine exits cleanly; if a slot is free, it proceeds as before. The key pitfall to avoid is releasing the semaphore when the context branch fires — since the goroutine never acquired a slot, the `defer` must not run in that path, which is why the `defer` appears only inside the `sem <- struct{}{}` case arm (after the select).

---

### Issue 2: Semaphore idiom — send to acquire, receive to release

**Problem:** The original code acquires with a send (`sem <- struct{}{}`) and releases with a receive (`<-sem`). This is the correct pairing for a buffered-channel semaphore: filling a slot reserves it, draining a slot returns it. The code is correct in this respect, but the absence of any comment made the team question whether the release was wrong, and the confusion contributed to the bug going unnoticed for longer.

**Fix:** A clarifying comment is added at the `defer func() { <-sem }()` line confirming that receive-to-release is the right operation for a send-to-acquire semaphore, so future readers do not second-guess the idiom and introduce an actual inversion.

**Explanation:** A buffered channel of capacity N allows N concurrent senders before it blocks. Sending fills one slot (acquire); receiving empties one slot (release). If someone inverts the pattern — sending to release and receiving to acquire — the channel starts empty, goroutines block trying to receive, and nothing can make progress unless something first sends. Keeping a clear comment prevents a well-meaning refactor from flipping the direction and reintroducing a deadlock.
