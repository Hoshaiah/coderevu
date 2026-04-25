---
slug: copy-list-passed-to-thread-shared-mutation
track: python
orderIndex: 31
title: Shared List Mutated Across Threads
difficulty: medium
tags:
  - concurrency
  - threading
  - correctness
language: python
---

## Context

This code is in `workers/batch_processor.py`. A list of records is split into chunks and each chunk is processed in a separate thread. The function is called from a Flask request handler when a bulk-import endpoint receives a large payload.

Users report that bulk imports occasionally produce duplicate records or skip records entirely — but only when the import contains more than a few hundred rows. Smaller imports always succeed. The bug is non-deterministic and cannot be reproduced in single-threaded test runs.

Adding logging inside `process_chunk` confirmed that some threads receive the same slice reference and see each other's modifications mid-iteration. A teammate added `copy.copy()` to the chunk before passing it to the thread but the bug persisted.

## Buggy code

```python
import threading
from typing import Callable

def process_chunk(chunk: list[dict], results: list, lock: threading.Lock, transform: Callable):
    for record in chunk:
        record["processed"] = True  # mutates the dict in-place
        transformed = transform(record)
        with lock:
            results.append(transformed)

def parallel_process(records: list[dict], transform: Callable, n_threads: int = 4) -> list:
    chunk_size = max(1, len(records) // n_threads)
    results = []
    lock = threading.Lock()
    threads = []

    for i in range(n_threads):
        # slicing creates a new list but its elements are the same dict objects
        chunk = records[i * chunk_size : (i + 1) * chunk_size]
        t = threading.Thread(target=process_chunk, args=(chunk, results, lock, transform))
        threads.append(t)
        t.start()

    for t in threads:
        t.join()

    return results
```
