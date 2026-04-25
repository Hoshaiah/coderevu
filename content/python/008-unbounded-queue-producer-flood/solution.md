## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Unbounded Queue Floods Memory
# ------------------------------------------------------------------------

import queue
import threading
from kafka import KafkaConsumer

# CHANGE 1: Set maxsize on the queue so it can hold at most 1000 events; this caps memory usage and creates back-pressure.
EVENT_QUEUE: queue.Queue = queue.Queue(maxsize=1000)

def producer(bootstrap_servers: str, topic: str) -> None:
    consumer = KafkaConsumer(topic, bootstrap_servers=bootstrap_servers)
    for msg in consumer:
        # CHANGE 2: queue.put() blocks when the queue is full, applying back-pressure to the Kafka consumer so ingestion slows to match DB write throughput.
        EVENT_QUEUE.put(msg.value)

def db_writer() -> None:
    while True:
        event = EVENT_QUEUE.get()
        # CHANGE 3: Wrap the DB write in try/except/finally so task_done is always called and a failing write is logged rather than silently lost.
        try:
            _write_to_db(event)
        except Exception as exc:
            import logging
            logging.exception("db_writer failed to write event: %s", exc)
        finally:
            EVENT_QUEUE.task_done()

def start(bootstrap_servers: str, topic: str, num_writers: int = 4) -> None:
    threading.Thread(target=producer, args=(bootstrap_servers, topic),
                     daemon=True).start()
    for _ in range(num_writers):
        threading.Thread(target=db_writer, daemon=True).start()

def _write_to_db(event) -> None:
    pass  # DB write omitted
```

## Explanation

### Issue 1: Unbounded Queue Accumulates Events

**Problem:** `queue.Queue()` with no `maxsize` argument grows without limit. When the DB writer threads fall behind the Kafka producer, events pile up in memory. Profiling confirms millions of event dicts sitting on the queue object, which is exactly what the OOM killer is reacting to after 20–30 minutes.

**Fix:** Replace `queue.Queue()` with `queue.Queue(maxsize=1000)` at the `EVENT_QUEUE` declaration (`CHANGE 1`). This caps the number of in-flight events to 1 000 items at any moment.

**Explanation:** A Python `queue.Queue` with `maxsize=0` (the default) accepts items indefinitely. Because DB writes are the bottleneck, the producer thread races ahead, and each unconsumed event dict remains reachable on the queue, so the garbage collector cannot free it. Setting `maxsize` to a concrete limit bounds the worst-case memory footprint to `maxsize × avg_event_size`. A reasonable value (e.g., 1 000–10 000) should be tuned to how many events fit comfortably in memory while still giving writer threads enough work to stay busy. If the limit is set too low, throughput drops because the producer blocks too frequently; if too high, memory pressure returns.

---

### Issue 2: Producer Has No Back-Pressure

**Problem:** Even after adding `maxsize`, the producer must actually block when the queue is full, otherwise it would bypass the cap by using `put_nowait` or a timeout variant. In the current code, the plain `EVENT_QUEUE.put(msg.value)` call is correct in form but only becomes meaningful once `maxsize` is set — without both changes together the fix is incomplete.

**Fix:** Keep `EVENT_QUEUE.put(msg.value)` (blocking form, no timeout) in the producer (`CHANGE 2`). With `maxsize` now set, this call blocks the producer thread whenever the queue is full, which naturally slows Kafka consumption to match the DB write rate.

**Explanation:** `queue.Queue.put()` with no `block=False` flag blocks the calling thread until a slot is free. This is the back-pressure signal: the Kafka consumer stops polling, which causes the consumer group to stop committing offsets, which causes the Kafka broker to pause delivering new messages to this consumer. The net effect is that the entire ingestion pipeline throttles to the speed of the slowest stage (DB writes) instead of letting the fast stage (Kafka reads) run freely. If someone later changes `put` to `put_nowait` or adds `timeout=0`, the back-pressure disappears and memory growth returns, so that call site deserves a comment explaining the intent.

---

### Issue 3: Missing Error Handling Loses Events and Can Break task_done Accounting

**Problem:** If `_write_to_db` raises an exception, `EVENT_QUEUE.task_done()` is never called. This means any code that calls `EVENT_QUEUE.join()` to wait for all events to be processed will block forever. The failed event is also silently discarded with no log entry, making debugging very difficult.

**Fix:** Wrap `_write_to_db(event)` in a `try/except/finally` block (`CHANGE 3`). The `finally` clause unconditionally calls `EVENT_QUEUE.task_done()`, and the `except` clause logs the exception with `logging.exception` so the failure is visible in logs.

**Explanation:** `queue.Queue.join()` decrements an internal counter only when `task_done()` is called. If the DB write throws and `task_done()` is skipped, the counter stays elevated and `join()` never returns — a deadlock if anything in the application waits on the queue to drain. Even without `join()` in the current code, adding error handling here is defensive: it keeps the accounting correct if `join()` is added later, and it makes operational problems visible. A related pitfall is retrying failed writes inside the `except` block; if retries are needed, they should use exponential back-off and a retry limit to avoid the writer thread stalling indefinitely on a permanently broken DB connection.
