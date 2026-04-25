## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Wait Without Loop for Spurious Wakeups
// ------------------------------------------------------------------------

import java.util.ArrayDeque;
import java.util.Deque;

public class DataBuffer {
    private final Deque<String> buffer = new ArrayDeque<>();
    private final int capacity;

    public DataBuffer(int capacity) {
        this.capacity = capacity;
    }

    public synchronized void put(String item) throws InterruptedException {
        // CHANGE 2: loop replaces `if` so a spurious or stolen wakeup re-checks capacity before proceeding
        while (buffer.size() == capacity) {
            wait();
        }
        buffer.addLast(item);
        notifyAll();
    }

    public synchronized String take() throws InterruptedException {
        // CHANGE 1: loop replaces `if` so the thread re-checks emptiness after every wakeup, including spurious ones
        while (buffer.isEmpty()) {
            wait();
        }
        notifyAll();
        return buffer.removeFirst();
    }
}
```

## Explanation

### Issue 1: Spurious Wakeup in `take()` Skips Guard

**Problem:** The consumer thread wakes up from `wait()` — without a producer having added anything — finds the buffer empty, and calls `removeFirst()` on an empty deque. `ArrayDeque.removeFirst()` throws `NoSuchElementException`, which propagates up the call stack as an unexpected `NullPointerException` or uncaught exception in the processing logic. This happens more on multi-core machines because the JVM and OS are more likely to deliver spurious wakeups there.

**Fix:** Replace the `if (buffer.isEmpty())` guard at the `CHANGE 1` site with `while (buffer.isEmpty())`. After returning from `wait()`, the thread loops back and re-evaluates the condition before touching the buffer.

**Explanation:** The Java Memory Model explicitly permits `wait()` to return even when no thread called `notify()` or `notifyAll()` — these are called spurious wakeups. An `if` guard checks the condition exactly once, before the first sleep, but never again on wakeup. A `while` loop re-checks the condition each time the thread is woken, so a spurious wakeup just causes the thread to call `wait()` again. There is also a related "stolen wakeup" scenario: two consumers wake together, one drains the last item, and the second finds the buffer empty — a `while` loop catches this too. The standard Java concurrency idiom documented in `Object.wait()` Javadoc requires the condition to be tested in a loop for exactly this reason.

---

### Issue 2: Spurious Wakeup in `put()` Allows Overflow

**Problem:** A producer wakes from `wait()` while the buffer is still full (spurious wakeup or another producer stole the slot first), skips the capacity check because it already passed the `if`, and calls `addLast()`, pushing the buffer past its declared `capacity`. Downstream consumers may process more items than memory budgets allow, and the invariant that the buffer never exceeds `capacity` is silently broken.

**Fix:** Replace `if (buffer.size() == capacity)` with `while (buffer.size() == capacity)` at the `CHANGE 2` site, mirroring the fix in `take()`.

**Explanation:** The same spurious-wakeup mechanism applies to producers. When `wait()` returns, the thread must re-evaluate whether there is actually room before inserting. With an `if`, a producer that was woken spuriously — or woken legitimately but then lost a race to another producer that filled the last slot — proceeds unconditionally to `addLast()`. Replacing `if` with `while` ensures the capacity invariant is re-verified on every wakeup. This pattern — always loop around `wait()` and re-test the condition — is the only safe way to use Java's built-in monitor `wait()`.
