---
slug: thread-pool-blocking-queue-deadlock
track: python
orderIndex: 36
title: Producer Queue Deadlocks Thread Pool
difficulty: hard
tags:
  - concurrency
  - threading
  - deadlock
language: python
---

## Context

This code lives in `pipeline/image_processor.py` and implements a producer–consumer pipeline for batch image processing. A single producer thread reads image paths from disk and enqueues tasks; a `ThreadPoolExecutor` processes them. Results are collected via a bounded `queue.Queue` that both the worker threads write to and the main thread reads from. The pipeline is used to process large datasets of up to 50,000 images per run.

Users report that the pipeline occasionally hangs indefinitely on large datasets — typically after processing several thousand images. CPU usage drops to 0% and no further progress is made. The process must be killed manually. The hang happens non-deterministically: sometimes on image 3,000, sometimes on image 12,000, sometimes not at all on small datasets.

The team added logging and confirmed that worker threads are blocking on `result_queue.put()` and the main thread is blocking on `executor.shutdown(wait=True)` — a textbook deadlock. They're not sure why `result_queue.put()` blocks since they believed the queue was being drained.

## Buggy code

```python
import queue
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

RESULT_QUEUE_SIZE = 100

def process_image(path: str) -> dict:
    # Simulate image processing
    return {"path": path, "width": 1920, "height": 1080}

def run_pipeline(image_dir: str) -> list[dict]:
    result_queue: queue.Queue = queue.Queue(maxsize=RESULT_QUEUE_SIZE)
    results = []

    def worker(path: str) -> None:
        result = process_image(path)
        result_queue.put(result)  # blocks when queue is full

    paths = list(Path(image_dir).glob("*.jpg"))

    with ThreadPoolExecutor(max_workers=8) as executor:
        for path in paths:
            executor.submit(worker, str(path))
        # Drain the result queue after submitting all tasks
        for _ in paths:
            results.append(result_queue.get())

    return results
```
