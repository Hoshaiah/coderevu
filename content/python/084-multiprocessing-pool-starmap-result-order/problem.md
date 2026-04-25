---
slug: multiprocessing-pool-starmap-result-order
track: python
orderIndex: 84
title: Pool starmap Result Order Lost
difficulty: hard
tags:
  - correctness
  - concurrency
  - multiprocessing
language: python
---

## Context

This module lives in `pipeline/parallel_transform.py` and uses a `multiprocessing.Pool` to apply a CPU-bound transform to a list of (id, payload) pairs. The results are supposed to be written back to a database keyed by the original ID. The module replaced a slow sequential loop to speed up nightly processing.

After the switch, a low rate of data corruption was detected in production: roughly 1-2% of rows had their transformed payload written to the wrong database row. The issue is completely absent in the single-threaded fallback path and in unit tests that use small input lists.

Code review confirmed that the database write step correctly uses the `result_id` field, but some `result_id` values appeared to belong to different payloads than expected. The team believed `Pool.imap_unordered` preserved insertion order for equal-priority tasks.

## Buggy code

```python
from multiprocessing import Pool
from typing import Callable

def transform_worker(args):
    record_id, payload, transform_fn = args
    result = transform_fn(payload)
    return record_id, result

def parallel_transform(
    records: list[tuple[int, bytes]],
    transform_fn: Callable,
    n_workers: int = 4,
) -> list[tuple[int, bytes]]:
    args = [(rid, payload, transform_fn) for rid, payload in records]
    with Pool(processes=n_workers) as pool:
        # imap_unordered yields results as they complete — faster but unordered
        results = list(pool.imap_unordered(transform_worker, args))
    return results

def write_results(db_conn, results: list[tuple[int, bytes]]):
    for i, (record_id, transformed) in enumerate(results):
        db_conn.execute(
            "UPDATE records SET payload = ? WHERE id = ?",
            # BUG: positional index `i` used instead of `record_id`
            (transformed, results[i][0]),
        )
```
