---
slug: list-slice-copy-not-deepcopy
track: python
orderIndex: 75
title: Shallow Slice Shares Nested Objects
difficulty: medium
tags:
  - correctness
  - python-builtins
  - data-mutation
language: python
---

## Context

`pipeline/batch_splitter.py` divides an incoming list of job records into fixed-size batches for parallel processing. Each batch is handed to a worker function that may annotate records with processing metadata by adding keys to the record dicts. The results are then aggregated.

Engineers report that after processing, some records in the original `jobs` list have unexpected extra keys (`_processed`, `_worker_id`) that shouldn't be there. These mutated records then fail a downstream schema validation step that rejects unknown keys. The bug doesn't appear when batch size equals the total number of jobs (i.e., a single batch).

The team tried switching from a `for` loop to a list comprehension for building batches with no change in behavior, confirming the issue is in the data structure itself rather than the loop.

## Buggy code

```python
def split_into_batches(jobs: list[dict], batch_size: int) -> list[list[dict]]:
    batches = []
    for i in range(0, len(jobs), batch_size):
        batch = jobs[i : i + batch_size]  # slice creates a shallow copy
        batches.append(batch)
    return batches


def process_batch(batch: list[dict]) -> list[dict]:
    for record in batch:
        # Annotate records in-place with processing metadata
        record["_processed"] = True
        record["_worker_id"] = id(batch)
    return batch


def run_pipeline(jobs: list[dict]) -> list[dict]:
    batches = split_into_batches(jobs, batch_size=10)
    results = []
    for batch in batches:
        results.extend(process_batch(batch))
    return results
```
