---
slug: thread-sleep-spin-busy-wait
track: python
orderIndex: 93
title: Busy-Wait Polling Starves CPU
difficulty: easy
tags:
  - perf
  - concurrency
  - threading
language: python
---

## Context

This background worker lives in `workers/job_dispatcher.py`. It picks tasks off a shared queue and dispatches them to a thread pool. The queue is populated by an HTTP handler in a separate thread whenever a new job arrives from a client.

In load testing, engineers noticed that CPU utilization sits at 100% on one core even when there are no jobs to process — the system is idle but hot. The task throughput looks fine under load, but idle machines are burning unnecessary compute and triggering cloud auto-scaling alerts.

Profiling with `py-spy` showed that the hot core is spending nearly all its time inside `dispatch_loop`. The queue population thread and the HTTP handler both look fine.

## Buggy code

```python
import threading
from queue import Queue, Empty

job_queue: Queue = Queue()

def dispatch_loop(pool_executor):
    while True:
        try:
            job = job_queue.get_nowait()
            pool_executor.submit(job)
            job_queue.task_done()
        except Empty:
            pass  # nothing to do, spin again

def start_dispatcher(pool_executor):
    t = threading.Thread(target=dispatch_loop, args=(pool_executor,), daemon=True)
    t.start()
    return t
```
