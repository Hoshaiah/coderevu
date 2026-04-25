## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Error Lost in Fire-and-Forget
// ------------------------------------------------------------------------

package notify

import (
	"fmt"
	"log"
)

type Event struct {
	OrderID string
	Amount  float64
}

func Dispatch(endpoints []string, evt Event) {
	for _, ep := range endpoints {
		// CHANGE 2: pass evt as a parameter to the goroutine so each goroutine gets its own copy, eliminating the data race if the caller mutates evt after Dispatch returns.
		go func(url string, e Event) {
			if err := sendWebhook(url, e); err != nil {
				// retry once
				// CHANGE 1: log the error from the retry instead of silently returning; this surfaces permanent failures that were previously swallowed.
				if err := sendWebhook(url, e); err != nil {
					log.Printf("webhook failed after retry: url=%s err=%v", url, err)
					return
				}
			}
		}(ep, evt)
	}
}

func sendWebhook(url string, evt Event) error {
	// real implementation does HTTP POST
	return fmt.Errorf("connection refused: %s", url)
}

func init() { log.SetFlags(0) }
```

## Explanation

### Issue 1: Retry errors silently discarded

**Problem:** When `sendWebhook` fails on both the initial attempt and the retry, the goroutine executes `return` without logging or recording the error. Operators see no output, no metrics, and no indication that the webhook was never delivered. Customers miss order confirmation emails with no trace in any log.

**Fix:** Replace the bare `return` inside the retry error branch with `log.Printf("webhook failed after retry: url=%s err=%v", url, err)` before returning, so every permanent failure produces a visible log line.

**Explanation:** The inner `if err := sendWebhook(...); err != nil` block captures the error in a new `err` variable scoped to that block. When execution reaches `return`, the error value is simply abandoned — Go does not propagate unhandled errors automatically. Adding `log.Printf` at that site means any HTTP failure that survives both attempts will appear in the application log. A related pitfall: if you later add a metrics counter or alerting hook, this is the only place in the goroutine where you know a final failure has occurred, so it is the right place to increment that counter too.

---

### Issue 2: Event captured by reference across goroutine boundary

**Problem:** The goroutine closure closes over the `evt` variable declared in `Dispatch`'s parameter list. If the caller holds a pointer to the same struct fields, or if `Event` grows slice/map fields in the future, concurrent reads in the goroutine and writes in the caller produce a data race that the Go race detector will flag and that can cause corrupted webhook payloads.

**Fix:** Add `e Event` as a second parameter to the goroutine literal and pass `evt` at the call site: `go func(url string, e Event) { ... }(ep, evt)`. All references to `evt` inside the goroutine body are replaced with `e`.

**Explanation:** In Go, a goroutine closure that references an outer variable shares that variable's memory location, not a copy of its value at launch time. For value types like a plain struct with only scalar fields, the current `Event` definition happens to be safe, but this is fragile: adding a `Metadata map[string]string` field to `Event` later would immediately introduce a race without any other code change. Passing `evt` as a parameter forces a copy at the moment the goroutine is spawned, so the goroutine works on its own independent data regardless of what happens to the original after `Dispatch` returns. This pattern also makes the data flow explicit and easier to reason about during code review.
