## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Leak on Timeout
// ------------------------------------------------------------------------

package fetcher

import (
	"context"
	"fmt"
	"net/http"
)

func FetchFirst(ctx context.Context, urls []string) (string, error) {
	// CHANGE 1: Buffer the channel to len(urls) so every goroutine can send without blocking, preventing goroutine leaks when the caller stops listening.
	results := make(chan string, len(urls))

	// CHANGE 2: Create a cancel context so we can stop all workers as soon as we have a result or the parent context fires.
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	for _, u := range urls {
		url := u
		go func() {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			results <- fmt.Sprintf("%s:%d", url, resp.StatusCode)
		}()
	}

	select {
	case res := <-results:
		// CHANGE 2: cancel() is called via defer above, which unblocks all in-flight HTTP requests that share this context.
		return res, nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
```

## Explanation

### Issue 1: Unbuffered channel blocks worker goroutines

**Problem:** Every goroutine that successfully gets an HTTP response tries to send on `results`. Because `results` is unbuffered, a goroutine can only send when something is actively receiving. Once the `select` picks `ctx.Done()` and `FetchFirst` returns, nobody is receiving from `results` anymore. Every goroutine that later tries to send blocks permanently, leaking one goroutine per URL.

**Fix:** Replace `make(chan string)` with `make(chan string, len(urls))` so the channel can hold one value per worker. Every goroutine can complete its send without a receiver being present at the same moment.

**Explanation:** An unbuffered channel in Go requires both the sender and receiver to be ready at the same instant. When the deadline fires first, the `select` arm returns and `FetchFirst` exits. The goroutines that were still waiting for their HTTP response eventually get one and reach `results <- ...`, but there is no receiver — they block forever. Buffering the channel to `len(urls)` means a goroutine can deposit its result and exit cleanly even if no one ever reads that slot. The unread values in the channel are garbage-collected once the channel itself has no more references.

---

### Issue 2: No cancellation signal to stop remaining workers after first result

**Problem:** Even if the buffered channel prevents permanent blocking, goroutines that are still mid-request continue to run after `FetchFirst` returns a result. Under high request rates this accumulates many unnecessary in-flight HTTP calls, consuming file descriptors, memory, and goroutine stack space.

**Fix:** Add `ctx, cancel := context.WithCancel(ctx)` immediately after the channel creation, and `defer cancel()` so the derived context is cancelled as soon as `FetchFirst` returns by any path — success or timeout.

**Explanation:** `http.NewRequestWithContext` attaches the context to the request, so the HTTP client aborts the connection as soon as that context is cancelled. By wrapping the caller's context in a child `WithCancel` context, we get a dedicated cancel function scoped to this one call of `FetchFirst`. The `defer cancel()` fires the moment `FetchFirst` returns, regardless of which `select` arm was chosen. Workers that are still waiting for a response immediately get a context-cancellation error from `http.DefaultClient.Do` and return. A related pitfall: without the buffered channel fix (Issue 1), goroutines that already finished their HTTP call would still block on the channel send even after `cancel()` fires, because `cancel` only helps code that is actively watching the context — not a goroutine stuck on a channel operation.
