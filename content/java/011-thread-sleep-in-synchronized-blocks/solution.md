## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Thread.sleep Inside Synchronized Block
// ------------------------------------------------------------------------

public class NotificationDispatcher {
    private final ApiClient apiClient;

    public NotificationDispatcher(ApiClient apiClient) {
        this.apiClient = apiClient;
    }

    // CHANGE 1: Removed `synchronized` from the method signature so threads do not hold a shared monitor while sleeping; each thread now executes send() concurrently and only its own stack sleeps during back-off.
    public void send(Notification notification) {
        boolean sent = false;
        while (!sent) {
            ApiResponse response = apiClient.post(notification);
            if (response.isRateLimited()) {
                try {
                    // CHANGE 1: Thread.sleep is still used for back-off, but without the synchronized monitor it only blocks the calling thread, not every other thread waiting to call send().
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
            } else {
                sent = true;
            }
        }
    }

    interface Notification {}
    interface ApiResponse {
        boolean isRateLimited();
    }
    interface ApiClient {
        ApiResponse post(Notification n);
    }
}
```

## Explanation

### Issue 1: `synchronized` holds monitor during sleep

**Problem:** All 20 worker threads try to call `send()`, but only one holds the `synchronized` monitor at a time. When the one thread inside `send()` hits a 429 and calls `Thread.sleep(1000)`, it keeps the monitor for the entire second. Every other thread queues up waiting for that monitor. As each thread eventually gets in and also sees a rate-limit response, they each sleep for a full second in turn — serializing all 20 threads and stalling the application for up to 20 seconds, not 1.

**Fix:** Remove the `synchronized` keyword from the `send` method signature. The fixed method is `public void send(Notification notification)` with no lock held at the method level.

**Explanation:** Java's `synchronized` instance method acquires the intrinsic lock on `this` for the entire method body, including any blocking calls inside it. `Thread.sleep` does not release the monitor — it suspends the thread while holding it. So every thread that wants to call `send()` must wait for the sleeping thread to wake up, finish, and exit the method before the next thread can enter. Because `apiClient.post()` is stateless and thread-safe (it talks to an external HTTP API), there is nothing inside `send()` that actually needs mutual exclusion. Removing `synchronized` lets each thread sleep independently: if thread A is backing off, threads B through T can still issue their own requests without waiting. One related pitfall: if `ApiClient` itself were stateful and not thread-safe, you would need to protect it differently (e.g., a connection pool), rather than coarse-grained synchronization on the dispatcher.

---
