---
slug: multiprocessing-shared-counter-no-lock
track: python
orderIndex: 22
title: "Unsynchronised Shared Counter in Workers"
difficulty: medium
tags: ["concurrency", "multiprocessing", "race-condition"]
language: python
---

## Context

This worker module lives at `jobs/importer.py`. It uses `multiprocessing` to parallelize importing product records from a large CSV file. A `Value` counter shared across processes tracks how many records have been successfully inserted so far; the main process prints progress to the console every few seconds.

The final count printed after all workers finish is consistently lower than the actual number of rows in the file — sometimes by hundreds. The database contains the correct number of rows (verified with `SELECT COUNT(*)`), so the inserts themselves are fine. The only thing that's wrong is the progress counter.

The team confirmed it is not a rounding or off-by-one error from the CSV parsing, and it reproduces reliably on machines with 4+ cores. Single-process runs always report the correct count.

## Buggy code

```python
import csv
import multiprocessing as mp
from multiprocessing.sharedctypes import Value
import ctypes

def import_chunk(rows: list[dict], counter: Value) -> None:
    for row in rows:
        _insert_row(row)          # assume this writes to the DB
        counter.value += 1

def run_import(path: str, workers: int = 4) -> int:
    with open(path, newline="") as f:
        all_rows = list(csv.DictReader(f))

    chunk_size = len(all_rows) // workers
    chunks = [
        all_rows[i * chunk_size:(i + 1) * chunk_size]
        for i in range(workers)
    ]
    counter = Value(ctypes.c_int, 0)

    procs = [mp.Process(target=import_chunk, args=(chunk, counter))
             for chunk in chunks]
    for p in procs:
        p.start()
    for p in procs:
        p.join()

    return counter.value

def _insert_row(row: dict) -> None:
    pass  # DB insert omitted for brevity
```
