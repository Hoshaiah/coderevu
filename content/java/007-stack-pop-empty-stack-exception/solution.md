## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Stack.empty() Race Before pop() Call
// ------------------------------------------------------------------------

import java.util.Stack;

public class UndoManager {
    private final Stack<Runnable> history = new Stack<>();

    public void push(Runnable action) {
        // CHANGE 2: synchronize on `this` so push is part of the same mutual-exclusion domain as undo()
        synchronized (this) {
            history.push(action);
        }
    }

    public void undo() {
        Runnable action;
        // CHANGE 1: wrap empty()+pop() in a single synchronized block so no other thread can pop between the two calls
        synchronized (this) {
            if (history.empty()) {
                return;
            }
            action = history.pop();
        }
        // Run the action outside the lock to avoid holding the lock during potentially long user-defined work
        action.run();
    }

    public int size() {
        // CHANGE 2: synchronize size() for consistency so callers see a coherent value
        synchronized (this) {
            return history.size();
        }
    }
}
```

## Explanation

### Issue 1: TOCTOU Race Between `empty()` and `pop()`

**Problem:** Users clicking Undo rapidly from two UI threads can both pass the `history.empty()` check at nearly the same time, then both call `history.pop()`. The second pop hits an already-empty stack and throws `EmptyStackException`, crashing the editor. The crash is intermittent because the window between the two calls is tiny — it only opens under concurrent load.

**Fix:** The `undo()` method now wraps both `history.empty()` and `history.pop()` inside a single `synchronized (this)` block (CHANGE 1). The `Runnable` is captured into a local variable while the lock is held, then `run()` is called after releasing the lock.

**Explanation:** `Stack` inherits synchronization from `Vector`, but that synchronization only covers each individual method call in isolation. Between the return of `empty()` and the entry into `pop()`, the lock is released and re-acquired — leaving a gap. Thread A sees the stack has one element and passes the check. Thread B also sees one element and passes the check. Thread A pops the element successfully. Thread B now calls `pop()` on an empty stack and gets `EmptyStackException`. Wrapping both calls in one `synchronized (this)` block makes the check-then-act sequence atomic: only one thread can be inside that block at a time, so the state cannot change between the guard and the pop. Note that `run()` is deliberately placed outside the lock to avoid holding the mutex during arbitrary user code, which could cause deadlocks or long lock contention.

---

### Issue 2: No Consistent Class-Level Lock Across All Methods

**Problem:** Even after fixing `undo()`, `push()` and `size()` rely on Vector's per-call lock, which is the intrinsic lock of the `Stack` object itself — not `this` (the `UndoManager`). Mixing two different locks means `push()` can interleave mid-way through the `synchronized (this)` block in `undo()`, defeating the fix.

**Fix:** `push()` and `size()` are each wrapped in `synchronized (this)` blocks (CHANGE 2), so every access to `history` uses the same `UndoManager` instance lock that `undo()` uses.

**Explanation:** Java's `synchronized (this)` and the intrinsic lock inside `Vector`/`Stack` are two separate monitors. If `undo()` holds `this` but `push()` only acquires the `Stack`'s own lock, they do not mutually exclude each other — they are locking different objects. This means a concurrent `push()` could still modify the stack while `undo()` is between its empty check and pop, even after CHANGE 1 appears to fix the problem. Using a single consistent lock (`this`) for all methods that touch `history` ensures that every operation is serialized through the same gate. A related pitfall: if you later expose an iterator or a bulk operation over `history`, you must also wrap that in `synchronized (this)` for the same reason.
