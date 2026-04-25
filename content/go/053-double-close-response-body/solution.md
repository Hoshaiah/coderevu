## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Response Body Closed Twice
// ------------------------------------------------------------------------

package client

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type APIResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

func FetchUser(url string) (*APIResponse, error) {
	resp, err := http.Get(url)
	if err != nil {
		return nil, fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		// CHANGE 2: drain the body before returning so the transport can reuse the TCP connection.
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("unexpected status: %d", resp.StatusCode)
	}

	var result APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	// CHANGE 1: removed the explicit resp.Body.Close() here; the deferred close above is sufficient and the duplicate call causes a panic.
	return &result, nil
}
```

## Explanation

### Issue 1: Double Close of Response Body

**Problem:** Under concurrent load, the service panics with a message like `close of already-closed body`. The panic happens during or just after `json.Decode` returns, because `resp.Body.Close()` is called explicitly on line 30 and then called again when the deferred `resp.Body.Close()` fires as the function returns.

**Fix:** Remove the explicit `resp.Body.Close()` call that appears after the `json.NewDecoder(...).Decode(...)` line (marked `// CHANGE 1`). The `defer resp.Body.Close()` registered earlier is the only close needed.

**Explanation:** `defer` schedules `resp.Body.Close()` to run when `FetchUser` returns, regardless of which return path is taken. The explicit call added as a "premature optimisation" runs first — immediately after decode — and closes the body. Then, as the function returns, the deferred call fires and closes the same body a second time. Many `http.Transport` body implementations (e.g., `http.bodyEOFSignal`) use a mutex and a flag to detect this and panic rather than silently ignore it. The panic is non-deterministic because the race between goroutines sharing the transport's connection pool affects timing. The fix is to trust `defer` to handle the single close; it already runs promptly on function exit.

---

### Issue 2: Body Not Drained on Non-200 Status

**Problem:** When the server returns a non-200 status code, the function returns immediately after checking `resp.StatusCode`, leaving the response body unread. The HTTP transport cannot reuse the underlying TCP connection until the body is fully read and closed, so each non-200 response leaks a connection slot until the OS reclaims it.

**Fix:** Add `io.Copy(io.Discard, resp.Body)` immediately before the early return in the non-200 branch (marked `// CHANGE 2`). This reads and discards the remaining body bytes, allowing the deferred `resp.Body.Close()` to signal the transport that the connection is reusable.

**Explanation:** Go's `net/http` transport keeps a pool of persistent TCP connections. It only returns a connection to the pool after the response body has been fully consumed and closed. If you close without draining, the transport must discard the connection entirely because it cannot know where the response payload ends and the next response begins on the same socket. Under high request rates with frequent non-200 responses, this exhausts the connection pool and forces new TCP handshakes for every request. `io.Copy(io.Discard, resp.Body)` reads the body cheaply without allocating — `io.Discard` is a no-op writer — and lets the transport recycle the connection normally.
