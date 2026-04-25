## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Request Context Not Propagated
// ------------------------------------------------------------------------

package handlers

import (
	"encoding/json"
	"net/http"
)

func SearchHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "missing query", http.StatusBadRequest)
		return
	}

	// Call downstream search service
	// CHANGE 1: Use http.NewRequestWithContext instead of http.NewRequest, passing r.Context() so that cancellation (e.g. client disconnect) propagates to the downstream call.
	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, "https://search.internal/query?q="+query, nil)
	if err != nil {
		http.Error(w, "failed to build request", http.StatusInternalServerError)
		return
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "search failed", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var result map[string]any
	// CHANGE 2: Check and return errors from JSON decode and encode so serialization failures are surfaced to the caller instead of silently producing empty or partial responses.
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		http.Error(w, "failed to decode upstream response", http.StatusBadGateway)
		return
	}
	if err := json.NewEncoder(w).Encode(result); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
		return
	}
}
```

## Explanation

### Issue 1: Context Not Propagated to Downstream Request

**Problem:** When a client disconnects, the Go HTTP server cancels `r.Context()`. But the downstream request is built with `http.NewRequest`, which attaches a background context that is never cancelled. The downstream search service keeps running the query, holding a connection and CPU, even though nobody is waiting for the answer.

**Fix:** Replace `http.NewRequest(http.MethodGet, url, nil)` with `http.NewRequestWithContext(r.Context(), http.MethodGet, url, nil)`. This is the only line changed to wire up cancellation.

**Explanation:** `http.NewRequest` internally uses `context.Background()`, which has no deadline and is never cancelled. When `http.DefaultClient.Do` executes the request, it holds the connection open until the downstream server replies, regardless of what happens on the client side. By passing `r.Context()` instead, the `http.Client` monitors that context: if it is cancelled (client disconnect, server timeout, or any other cause), the client aborts the in-flight TCP connection immediately. A related pitfall: if you later add a timeout via `context.WithTimeout`, you must still start from `r.Context()` rather than `context.Background()` so both the parent cancellation and the timeout apply.

---

### Issue 2: JSON Decode and Encode Errors Silently Discarded

**Problem:** If the upstream service returns malformed JSON, `Decode` fails and `result` stays `nil`. The handler then encodes `nil` and writes `null` to the client with a `200 OK` status, giving the caller no indication that anything went wrong. Similarly, if writing the response fails mid-stream, the handler exits silently.

**Fix:** Capture the return values of `json.NewDecoder(resp.Body).Decode(&result)` and `json.NewEncoder(w).Encode(result)` into `err`, check them, and call `http.Error` with an appropriate status code before returning.

**Explanation:** Both `Decode` and `Encode` return an `error` that the original code discards entirely using the blank-assignment pattern of calling them as statements. When `Decode` fails on bad upstream JSON, `result` is whatever zero value the map was initialised to (a nil map), so `Encode` writes `null` — a valid JSON token, but semantically wrong and indistinguishable from a legitimate empty result. Returning `502 Bad Gateway` on a decode failure correctly signals that the upstream response was unusable. For the encode error, a `500` is appropriate because at that point the response writer is local infrastructure. One caveat: if you have already written headers or partial body before the encode error, `http.Error` cannot overwrite the status code, so keeping the encode as the last operation (as it is here) minimises that risk.
