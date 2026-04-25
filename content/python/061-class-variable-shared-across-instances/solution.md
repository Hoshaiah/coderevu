## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Class Variable Shared Across Instances
# ------------------------------------------------------------------------

import threading
from typing import Any

class BatchSender:
    def __init__(self, topic: str, max_batch: int = 100) -> None:
        self.topic = topic
        self.max_batch = max_batch
        # CHANGE 1: _buffer is now an instance variable so each BatchSender owns its own private message list instead of sharing a single class-level list across all instances.
        self._buffer: list[Any] = []
        # CHANGE 2: _lock is now an instance variable so each BatchSender has its own lock, eliminating false contention between independent topic senders.
        self._lock = threading.Lock()

    def send(self, message: Any) -> None:
        with self._lock:
            self._buffer.append(message)
            if len(self._buffer) >= self.max_batch:
                self._flush()

    def _flush(self) -> None:
        batch = self._buffer[:]
        self._buffer.clear()
        _publish(self.topic, batch)

def _publish(topic: str, batch: list) -> None:
    pass
```

## Explanation

### Issue 1: Shared Buffer Across Instances

**Problem:** All `BatchSender` instances write into the same `_buffer` list. When one instance's buffer fills up and calls `_flush`, it sends every message accumulated by every other instance — including messages meant for different topics — to its own `self.topic`. Operators see messages from `topic-A` appearing on `topic-B` because whichever sender hits `max_batch` first drains the shared list.

**Fix:** Remove `_buffer: list[Any] = []` from the class body and replace it with `self._buffer: list[Any] = []` inside `__init__`, making it an instance attribute that is created fresh for every `BatchSender` object.

**Explanation:** In Python, a mutable object assigned at class scope is created once and stored on the class itself. Every instance that reads `self._buffer` and does not find the name in its own `__dict__` falls through to the class `__dict__` and finds the same list object. When instance A appends a message, instance B sees that message in its `self._buffer` too, because they are looking at the identical list. Moving the assignment to `__init__` causes Python to store a new list in each instance's `__dict__`, so attribute lookup stops there and never reaches the class. A related pitfall: if the class-level list were replaced with an immutable default like `None` or `0`, the sharing would be invisible until someone actually mutated it, which is why mutable class-level defaults are especially tricky.

---

### Issue 2: Shared Lock Across Instances

**Problem:** `_lock` is also a class-level attribute, so all `BatchSender` instances share a single `threading.Lock`. A worker sending to `topic-A` blocks any concurrent worker sending to `topic-B` even though those two senders have completely independent buffers (once Issue 1 is fixed). Under load this produces unnecessary serialization across topics.

**Fix:** Remove `_lock = threading.Lock()` from the class body and replace it with `self._lock = threading.Lock()` inside `__init__`, giving each instance its own lock.

**Explanation:** A `threading.Lock` is a stateful object: acquiring it on one instance blocks any other code that tries to acquire the same object. When the lock lives on the class, two threads calling `send` on two different `BatchSender` instances both try to acquire the one shared lock and one must wait. After making `_buffer` an instance variable, the lock sharing causes no data corruption, but it still serializes all topic senders against each other, defeating the purpose of having separate instances. Moving `_lock` to `__init__` means each sender protects only its own buffer, and two senders can `send` concurrently without blocking each other.
