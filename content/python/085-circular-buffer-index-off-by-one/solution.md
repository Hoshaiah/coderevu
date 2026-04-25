## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Circular Buffer Overwrites Unread Data
# ------------------------------------------------------------------------

import threading

class RingBuffer:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self._buf = [None] * capacity
        self._head = 0  # next write position
        self._tail = 0  # next read position
        self._count = 0
        self._lock = threading.Lock()

    def push(self, item) -> None:
        # CHANGE 1: acquire the lock before touching any shared state so no other thread can observe a mid-update buffer.
        with self._lock:
            self._buf[self._head] = item
            self._head = (self._head + 1) % self.capacity
            if self._count < self.capacity:
                self._count += 1
            else:
                # overwrite: advance tail to discard oldest
                self._tail = (self._tail + 1) % self.capacity

    def pop(self) -> object:
        # CHANGE 2: acquire the lock for the entire read-and-advance sequence so _tail and _count stay consistent with push().
        with self._lock:
            if self._count == 0:
                return None
            item = self._buf[self._tail]
            self._tail = (self._tail + 1) % self.capacity
            self._count -= 1
            return item

    @property
    def size(self) -> int:
        # CHANGE 3: hold the lock when reading _count so callers never see a value that is mid-update (e.g., transiently above capacity).
        with self._lock:
            return self._count
```

## Explanation

### Issue 1: `push()` runs without the lock

**Problem:** The producer calls `push()` and writes to `_buf`, updates `_head`, and possibly advances `_tail`, all without holding `_lock`. If the consumer calls `pop()` at the same time, it can read a slot while `push()` is still modifying it, or see a stale `_tail` after `push()` has already moved it, causing it to return an old value a second time.

**Fix:** Wrap the entire body of `push()` in `with self._lock:` so every read and write to `_buf`, `_head`, `_tail`, and `_count` is serialized with `pop()`.

**Explanation:** Before the fix, `push()` does `self._buf[self._head] = item` and then `self._head = (self._head + 1) % self.capacity` as two separate unguarded stores. A context switch between those two lines lets `pop()` see `_head` still pointing at the slot being written, so the consumer might pick up a `None` or the previous value. Additionally, when the buffer is full, `push()` advances `_tail` outside the lock, so `pop()` can compute its own `_tail + 1` from a value that `push()` has simultaneously changed, producing a duplicate read. Putting both methods under the same lock makes the write-then-advance sequence atomic from the consumer's point of view.

---

### Issue 2: `pop()` runs without the lock

**Problem:** The consumer reads `self._buf[self._tail]`, then increments `_tail` and decrements `_count`, all outside `_lock`. A concurrent `push()` that finds the buffer full will also advance `_tail` at the same moment, leaving `_tail` incremented twice and skipping a slot — the consumer then reads the same slot on the next call.

**Fix:** Wrap the entire body of `pop()` in `with self._lock:` so the read, `_tail` advance, and `_count` decrement are atomic with respect to any concurrent `push()`.

**Explanation:** Consider a full buffer. `push()` checks `_count == capacity`, decides to advance `_tail`, and is preempted just before doing so. `pop()` runs, advances `_tail` from position 3 to 4, and decrements `_count` to `capacity - 1`. `push()` resumes and advances `_tail` again from 4 to 5, discarding the item at slot 4 that was never read. On the next `pop()`, `_tail` starts at 5, and slot 4 is silently lost. Holding the lock in both methods prevents this interleaving. A related pitfall: if `_count` is read in `push()` while `pop()` is in the middle of decrementing it, `push()` may wrongly believe the buffer is still full and advance `_tail` unnecessarily.

---

### Issue 3: `size` property reads `_count` without the lock

**Problem:** Under concurrent load, `push()` increments `_count` and, in a separate operation, `pop()` decrements it. A caller that reads `size` between those two operations sees `_count` in a transient state, which is how QA observes values briefly exceeding `capacity`.

**Fix:** Add `with self._lock:` inside the `size` property before returning `self._count`, ensuring the read sees a fully committed value.

**Explanation:** In CPython, `self._count += 1` compiles to a `LOAD_ATTR`, an `INPLACE_ADD`, and a `STORE_ATTR` — three bytecodes. The GIL can release between any two of them. If the `size` property reads `_count` after the `INPLACE_ADD` but before the `STORE_ATTR`, it sees neither the old nor the new value consistently. Even ignoring CPython's GIL, on other Python implementations or with free-threaded builds, the lack of a memory barrier means the read can be reordered. Locking the property read costs very little — `_count` is read far less frequently than it is written — and eliminates the race entirely.
