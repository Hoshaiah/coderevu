---
slug: itertools-chain-consumed-twice
track: python
orderIndex: 48
title: Exhausted Iterator Passed to Two Consumers
difficulty: easy
tags:
  - correctness
  - perf
  - itertools
language: python
---

## Context

This ETL helper lives in `pipeline/transforms.py`. It takes two sorted iterables of records, merges them, deduplicates by `id`, then both counts the total and writes the records to disk. It is called during the nightly merge job that combines records from two regional databases.

The job has started silently producing empty output files. The record count logged at the end is correct — it matches expectations — but the output file written by `_write_records()` contains nothing. No exception is raised anywhere.

A developer added a print statement inside `_write_records()` and confirmed the function is called but iterates over zero items. The count logging line runs first and appears fine.

## Buggy code

```python
import itertools
from typing import Iterable, Iterator

def _dedup(records: Iterable[dict]) -> Iterator[dict]:
    seen = set()
    for rec in records:
        if rec["id"] not in seen:
            seen.add(rec["id"])
            yield rec

def _write_records(records: Iterable[dict], path: str) -> None:
    with open(path, "w") as f:
        for rec in records:
            f.write(str(rec) + "\n")

def merge_and_write(
    source_a: Iterable[dict],
    source_b: Iterable[dict],
    output_path: str,
) -> int:
    merged = _dedup(itertools.chain(source_a, source_b))
    count = sum(1 for _ in merged)
    _write_records(merged, output_path)
    return count
```
