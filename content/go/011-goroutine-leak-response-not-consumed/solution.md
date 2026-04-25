## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Blocked on HTTP Response
// ------------------------------------------------------------------------

package fetcher

import (
	"encoding/json"
	"net/http"
	"sync"
)

type Result struct {
	URL  string
	Data map[string]any
}

func fetchAll(urls []string) []Result {
	results := make(chan Result, len(urls))
	var wg sync.WaitGroup

	for _, u := range urls {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			resp, err := http.Get(url)
			if err != nil {
				return
			}
			// CHANGE 1: Always close resp.Body so the HTTP transport can reuse or close the underlying connection; without this, every call leaks a connection-reader goroutine inside net/http.
			defer resp.Body.Close()
			var data map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
				// CHANGE 2: Return here without sending so the goroutine exits cleanly; resp.Body is still closed by the deferred call above, fixing the leak on the error path too.
				return
			}
			results <- Result{URL: url, Data: data}
		}(u)
	}

	wg.Wait()
	close(results)

	var out []Result
	for r := range results {
		out = append(out, r)
	}
	return out
}
```

## Explanation

### Issue 1: `resp.Body` never closed, leaking connections

**Problem:** After a successful `http.Get`, the response body is never closed. Over hours of operation, every URL fetch leaves a TCP connection open and an internal `net/http` goroutine blocked trying to drain or hold that connection. The goroutine count grows by one per URL per pipeline run, which is exactly the leak operators observe.

**Fix:** Add `defer resp.Body.Close()` immediately after the nil-error check on `resp`, before any reads from the body. This is the single line added at CHANGE 1.

**Explanation:** When `http.Get` returns without error, the transport has already received the response headers and handed you a `resp.Body` `io.ReadCloser` backed by a live TCP connection. The transport starts an internal goroutine to manage that connection. Until `Close()` is called (and the body is fully drained or discarded), that goroutine cannot return the connection to the pool or shut it down — it stays alive indefinitely. With large bodies, the body is decoded but `Close` is never called, so the transport goroutine blocks forever. Using `defer` ensures `Close` runs even if a later error causes an early `return`, covering all exit paths from the goroutine.

---

### Issue 2: Body not closed on JSON decode error path

**Problem:** When `json.Decode` fails, the goroutine returns immediately without closing `resp.Body`. This means the connection leak happens on error responses too — for example, a 200 OK with non-JSON content, or a truncated payload — not only on successful decodes.

**Fix:** The `defer resp.Body.Close()` placed at CHANGE 1 — before the decode call — already covers this path. CHANGE 2 marks the `return` inside the decode-error branch to make explicit that this path is now safe: the deferred close fires regardless of which `return` is taken.

**Explanation:** Go's `defer` runs when the surrounding function (here the goroutine closure) exits, no matter which code path triggers that exit. By placing the `defer` before any conditional returns, both the decode-error branch and the success path are covered with a single statement. Without the `defer`, you would need to call `resp.Body.Close()` explicitly before every `return`, and it is easy to miss one — as happened here with the error branch.
