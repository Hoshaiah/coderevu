## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — PriorityQueue Comparator Returns Wrong Max
// ------------------------------------------------------------------------

import java.util.PriorityQueue;
import java.util.Comparator;

public class TaskScheduler {

    public static class Task {
        final String name;
        final int priority;
        Task(String name, int priority) {
            this.name = name;
            this.priority = priority;
        }
    }

    // Higher priority number = more urgent
    // CHANGE 1: Reversed comparator to descending order so poll() returns the highest-priority task, not the lowest.
    private final PriorityQueue<Task> queue = new PriorityQueue<>(
            Comparator.comparingInt((Task t) -> t.priority).reversed()
    );

    public void submit(Task task) {
        queue.offer(task);
    }

    public Task pollHighestPriority() {
        // CHANGE 2: Added an explicit check so callers get a clear IllegalStateException instead of a silent null when the queue is empty.
        if (queue.isEmpty()) {
            throw new IllegalStateException("pollHighestPriority called on an empty queue");
        }
        return queue.poll();
    }
}
```

## Explanation

### Issue 1: Comparator Orders Tasks Ascending Instead of Descending

**Problem:** `Comparator.comparingInt(t -> t.priority)` sorts tasks in ascending order of their priority number. Java's `PriorityQueue` is a min-heap by default, so `poll()` always removes the element the comparator considers smallest — the task with the lowest priority number. Operators see background tasks (priority 1) execute before urgent user-facing tasks (priority 100).

**Fix:** Chain `.reversed()` onto the comparator at the `PriorityQueue` constructor site, changing `Comparator.comparingInt((Task t) -> t.priority)` to `Comparator.comparingInt((Task t) -> t.priority).reversed()`. This makes the heap treat the highest priority number as the smallest element from the comparator's perspective, so `poll()` returns the most urgent task.

**Explanation:** `PriorityQueue` internally maintains a min-heap: the element that compares as "least" according to the provided comparator sits at the head and is returned by `poll()`. With the original ascending comparator, priority 1 is "least", so it surfaces first. Reversing the comparator flips the ordering so priority 100 is now "least" from the heap's point of view, and that task surfaces first instead. A common related pitfall is trying to fix this by negating the priority value in the lambda (`t -> -t.priority`) — that works but breaks if priorities can be `Integer.MIN_VALUE` due to overflow; `.reversed()` is safer and more readable.

---

### Issue 2: Silent Null Return When Queue Is Empty

**Problem:** `queue.poll()` returns `null` when the queue is empty rather than throwing an exception. If any caller forgets to null-check the result and dereferences it (e.g., to read `task.name`), the program throws a `NullPointerException` far from the actual cause. The context states the queue always has at least one element when this method is called, but that invariant is not enforced in code.

**Fix:** Add an `if (queue.isEmpty())` guard at the top of `pollHighestPriority()` that throws `IllegalStateException` with a descriptive message before calling `queue.poll()`.

**Explanation:** Defensive enforcement of a precondition at the boundary where it can be checked clearly — inside `pollHighestPriority` — surfaces violations immediately with an actionable error message. Without the guard, a bug in the caller that submits no tasks before polling produces a `NullPointerException` many stack frames later, making it hard to diagnose. Using `IllegalStateException` (rather than, say, `NoSuchElementException`) signals that the object is in a state where this operation is not valid, which matches the documented invariant.
