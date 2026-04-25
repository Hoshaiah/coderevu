## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Unbounded Goroutine Fan-Out
// ------------------------------------------------------------------------

package crawler

import (
	"fmt"
	"net/http"
	"sync"
	"time"
)

// CHANGE 2: package-level HTTP client with a timeout so stalled requests do not hold goroutines/sockets open forever.
var httpClient = &http.Client{
	Timeout: 15 * time.Second,
}

// CHANGE 1: semaphore channel limits concurrent goroutines to 20, preventing unbounded fan-out that exhausts memory and file descriptors.
const maxConcurrency = 20

func RunCrawl(urls []string) []error {
	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		errs []error
	)

	// CHANGE 1: allocate a buffered channel used as a semaphore; each slot represents one allowed in-flight goroutine.
	sem := make(chan struct{}, maxConcurrency)

	for _, u := range urls {
		wg.Add(1)
		// CHANGE 1: acquire a semaphore slot before launching the goroutine so at most maxConcurrency goroutines run concurrently.
		sem <- struct{}{}
		go func(url string) {
			defer wg.Done()
			// CHANGE 1: release the semaphore slot when the goroutine finishes so the next URL can proceed.
			defer func() { <-sem }()
			if err := fetchAndIndex(url); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}(u)
	}

	wg.Wait()
	return errs
}

func fetchAndIndex(url string) error {
	// CHANGE 2: use the timeout-configured httpClient instead of the default http.Get which has no timeout.
	resp, err := httpClient.Get(url)
	if err != nil {
		return fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()
	return nil
}
```

## Explanation

### Issue 1: Unbounded goroutine fan-out

**Problem:** `RunCrawl` launches one goroutine for every URL in the input slice with no upper bound. With thousands of URLs, thousands of goroutines start simultaneously, each opening an outbound HTTP connection. The VM's file descriptors are exhausted, the goroutine stacks and HTTP buffers consume all available RAM, and the OOM killer terminates the process before any indexing completes.

**Fix:** A buffered channel `sem` of size `maxConcurrency` (20) acts as a semaphore. The main loop sends a token into `sem` before launching each goroutine (`sem <- struct{}{}`), and each goroutine releases its token via `defer func() { <-sem }()`. This caps concurrent goroutines at 20 at any moment.

**Explanation:** Goroutines themselves are cheap, but each one here immediately opens a TCP connection and allocates HTTP response buffers. At 5,000 URLs that is 5,000 simultaneous TCP connections. Most operating systems default to a per-process file-descriptor limit of 1,024, so the majority of `http.Get` calls fail with "too many open files" even before memory pressure hits. The semaphore pattern is the idiomatic Go way to bound this: the channel buffer size is the concurrency ceiling, and the blocking send in the main loop naturally back-pressures URL dispatch. A related pitfall is setting `maxConcurrency` too high for the target host — many servers rate-limit or ban clients that open dozens of connections from the same IP, so 20 is a conservative default that can be tuned.

---

### Issue 2: No HTTP client timeout

**Problem:** `http.Get` uses the default `http.DefaultClient`, which has a zero `Timeout` field meaning no timeout at all. A server that accepts the TCP connection but never sends a response body will hold a goroutine open indefinitely. Under load, these stalled goroutines accumulate and compound the resource exhaustion from issue 1.

**Fix:** A package-level `*http.Client` named `httpClient` is created with `Timeout: 15 * time.Second`. `fetchAndIndex` calls `httpClient.Get(url)` instead of `http.Get(url)`.

**Explanation:** Go's `http.Client.Timeout` covers the entire request lifecycle: dial, TLS handshake, sending the request, reading the response headers, and reading the response body. Without it, a slow or adversarial server can hold a connection open for minutes or hours. Even with the semaphore in place, 20 goroutines each stalled for 10 minutes means the crawler makes no forward progress. Setting a 15-second timeout ensures each slot in the semaphore is freed promptly on failure. One related pitfall: `http.DefaultClient` is a shared global, so modifying it affects all code in the process including third-party libraries; always create a dedicated `*http.Client` for your own use.
