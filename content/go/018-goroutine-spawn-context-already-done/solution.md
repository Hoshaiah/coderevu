## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Spawned After Context Cancelled
// ------------------------------------------------------------------------

package notify

import (
	"context"
	"fmt"
	"net/http"
)

type Endpoint struct {
	URL string
}

func Dispatch(ctx context.Context, endpoints []Endpoint, payload []byte) []error {
	errCh := make(chan error, len(endpoints))

	for _, ep := range endpoints {
		ep := ep
		go func() {
			// CHANGE 1: Check whether the context is already done before starting the HTTP request; if cancelled, report the context error and skip sendWebhook entirely.
			select {
			case <-ctx.Done():
				errCh <- ctx.Err()
				return
			default:
			}
			// CHANGE 2: Only call sendWebhook when the context is still live, so no new HTTP request is initiated after the deadline expires.
			errCh <- sendWebhook(ctx, ep.URL, payload)
		}()
	}

	errs := make([]error, 0, len(endpoints))
	for range endpoints {
		if err := <-errCh; err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}

func sendWebhook(ctx context.Context, url string, payload []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send to %s: %w", url, err)
	}
	resp.Body.Close()
	return nil
}
```

## Explanation

### Issue 1: Context cancellation not checked before spawning work

**Problem:** Every goroutine in the loop calls `sendWebhook` unconditionally. When the context deadline expires mid-loop, goroutines that were already spawned but have not yet run still call `sendWebhook` and issue a real HTTP request to the endpoint. Operators see HTTP traffic arriving at webhook targets for several seconds after the deadline should have stopped all activity.

**Fix:** At the top of each goroutine body, a `select` statement with `case <-ctx.Done()` and a `default` branch is added. When the context is already cancelled at the moment the goroutine gets scheduled, it sends `ctx.Err()` to `errCh` and returns without ever reaching `sendWebhook`.

**Explanation:** Go goroutines are scheduled cooperatively by the runtime. Spawning a goroutine with `go func(){}()` does not run it immediately; it sits in the run queue until the scheduler picks it up. If 500 goroutines are spawned and the context expires after the first 50 run, the remaining 450 are still in the queue with nothing stopping them from executing `sendWebhook`. The `select { case <-ctx.Done(): ... default: }` pattern is a non-blocking check: if the context's done channel has a value ready (i.e. it is cancelled), the first case fires; otherwise execution falls through the `default` and the request proceeds normally. One pitfall: this check is not atomic with the HTTP dial — a goroutine can pass the check and then have its request cancelled mid-flight by `sendWebhook`'s own context-aware HTTP client. That is acceptable and already handled because `sendWebhook` uses `http.NewRequestWithContext`.

---

### Issue 2: sendWebhook called despite context being done at schedule time

**Problem:** Even with a context passed to `http.NewRequestWithContext`, the HTTP client only cancels a request that has already started dialing or sending. If the goroutine body reaches `sendWebhook` after the context is cancelled, the client may still open a TCP connection briefly before the cancellation propagates, causing the observable "late" webhook hits operators reported.

**Fix:** The `default` branch of the new `select` block lets execution fall through to `sendWebhook` only when the context is still live. The `sendWebhook` call itself is unchanged; it remains the sole path to making an HTTP request, but it is now guarded by the preceding check.

**Explanation:** `http.NewRequestWithContext` attaches the context to the request, but the cancellation is checked at specific points inside the HTTP stack (dial, TLS handshake, write, read). There is a small window between entering `sendWebhook` and the first cancellation check where the dial can begin. By refusing to enter `sendWebhook` at all when `ctx.Done()` is already closed, that window is eliminated for goroutines that were queued after the deadline passed. The combination of the pre-check (CHANGE 1) and the unchanged context-aware client means cancellation is enforced both before and during the HTTP round-trip.
