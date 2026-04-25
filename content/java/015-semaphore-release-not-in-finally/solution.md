## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Semaphore Permits Never Released
// ------------------------------------------------------------------------

import java.util.concurrent.Semaphore;

public class RateLimitedClient {
    // CHANGE 2: use fair=true so threads acquire permits in FIFO order and no thread starves under contention.
    private final Semaphore semaphore = new Semaphore(10, true);
    private final HttpClient httpClient;

    public RateLimitedClient(HttpClient httpClient) {
        this.httpClient = httpClient;
    }

    public String call(String endpoint, String payload) throws Exception {
        semaphore.acquire();
        // CHANGE 1: wrap the HTTP call in try/finally so the permit is always released even if post() throws.
        try {
            String response = httpClient.post(endpoint, payload);
            return response;
        } finally {
            semaphore.release();
        }
    }

    interface HttpClient {
        String post(String endpoint, String payload) throws Exception;
    }
}
```

## Explanation

### Issue 1: Permit Leaked on Exception

**Problem:** If `httpClient.post` throws any exception, execution jumps past `semaphore.release()` and the permit is never returned to the pool. Each failed request permanently shrinks the available permits. Once all 10 are consumed this way, every subsequent call to `call` blocks on `semaphore.acquire()` indefinitely, stalling the entire order-processing service.

**Fix:** Wrap the `httpClient.post` call in a `try/finally` block so that `semaphore.release()` moves into the `finally` clause and executes regardless of whether `post` returns normally or throws.

**Explanation:** `semaphore.release()` on the straight-line path only runs when no exception is thrown. Java's `finally` block runs in both the normal and exceptional paths, making it the right place for cleanup of acquired resources like permits, locks, or connections. The permit count is a shared integer; each leaked permit is gone until the JVM process restarts. Under a realistic error rate — say network timeouts hitting 5% of requests — the pool hits zero in as few as 200 calls. A related pitfall: if you add logging or response-transformation code between `post` and `release`, any runtime exception there would cause the same leak, so `finally` protects against future changes too.

---

### Issue 2: Unfair Semaphore Allows Thread Starvation

**Problem:** `new Semaphore(10)` uses the default unfair mode. When a permit becomes available, the JVM can hand it to any waiting thread, not necessarily the one that has been waiting longest. In a high-throughput service with many threads contending for the 10 slots, individual threads can be passed over repeatedly and never make progress, causing request timeouts even when throughput is otherwise healthy.

**Fix:** Change the constructor call to `new Semaphore(10, true)` at the CHANGE 2 site, enabling fair (FIFO) mode.

**Explanation:** An unfair semaphore lets a thread that just called `acquire` "barge" ahead of threads already parked in the wait queue, because the JVM scheduler may simply wake the newly requesting thread next. Fair mode maintains an internal FIFO queue; the thread that has waited longest gets the next available permit. The tradeoff is a small throughput reduction because the JVM cannot use barging optimisations, but for a payment-API client where per-request latency fairness matters, that tradeoff is usually worth it. Note that fair mode prevents starvation but does not prevent all latency spikes; if all 10 permits are held for a long time, every waiting thread still blocks.
