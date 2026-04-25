## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Stack Empty Check Before Pop Race
// ------------------------------------------------------------------------

import java.util.Stack;

public class WorkStealingQueue {

    private final Stack<Runnable> stack = new Stack<>();

    public void push(Runnable task) {
        // CHANGE 1: synchronize push so it participates in the same lock as trySteal, preventing interleaving during compound operations.
        synchronized (stack) {
            stack.push(task);
        }
    }

    public Runnable trySteal() {
        // CHANGE 1: wrap isEmpty()+pop() in a single synchronized block so no other thread can pop between the check and the pop.
        synchronized (stack) {
            if (!stack.isEmpty()) {
                return stack.pop();
            }
        }
        return null;
    }

    public int size() {
        // CHANGE 2: synchronize size() on the same lock so callers get a consistent view of the stack state.
        synchronized (stack) {
            return stack.size();
        }
    }
}
```

## Explanation

### Issue 1: TOCTOU Race on isEmpty/pop

**Problem:** Under concurrent load, `trySteal()` throws `EmptyStackException` even though it checks `stack.isEmpty()` first. The crash happens inside `stack.pop()` and is reproducible with many threads but disappears with one.

**Fix:** The `isEmpty()` check and `stack.pop()` call inside `trySteal()` are wrapped together in a single `synchronized (stack)` block. The `push()` method is also wrapped in the same lock so that no push or pop can interleave with the compound check-then-act in `trySteal()`.

**Explanation:** `Stack` extends `Vector`, so each individual method (`isEmpty`, `pop`, `push`) is synchronized on the `Stack` instance. That means each call is atomic in isolation, but two consecutive calls are not atomic together. Thread A calls `isEmpty()`, sees the stack has one element, and releases the lock. Before Thread A calls `pop()`, Thread B calls `pop()` and removes that last element. Thread A then calls `pop()` on an empty stack and gets `EmptyStackException`. The fix holds the lock across both `isEmpty()` and `pop()` as a single critical section, so no other thread can modify the stack between those two steps. A related pitfall: using `ArrayDeque` with explicit synchronization (or `ConcurrentLinkedDeque` with `pollLast`) would be a more modern approach, since `Stack`/`Vector` carry overhead from their own per-method synchronization that now becomes redundant.

---

### Issue 2: size() Compound Visibility

**Problem:** `size()` is not wrapped in the same `synchronized (stack)` block as the other methods. Callers reading `size()` concurrently with `trySteal()` or `push()` may see a stale or inconsistent value because the lock is released between the size read and any subsequent decision.

**Fix:** `size()` is wrapped in `synchronized (stack)` at `CHANGE 2`, matching the lock used in `push()` and `trySteal()`, so all three methods share one consistent critical section.

**Explanation:** Even though `Vector.size()` is itself synchronized, it acquires and releases the lock in one call. A caller who reads `size()` and then acts on the result (e.g., "if size > 0, steal") faces the same TOCTOU problem as the original `isEmpty()`/`pop()` pair. Synchronizing `size()` on the same object (`stack`) means the returned value is stable within any surrounding `synchronized (stack)` block a caller might use. Without this, any external code that grabs the lock on `stack` to do a multi-step operation would still see `size()` slip in and out between their locked steps.
