---
slug: pathlib-glob-sort-nondeterministic
track: python
orderIndex: 74
title: Glob Results Are Not Sorted
difficulty: medium
tags:
  - correctness
  - perf
  - filesystem
language: python
---

## Context

`etl/incremental_loader.py` processes daily data-drop files that arrive in a directory named by date: `2024-01-01.csv`, `2024-01-02.csv`, etc. The ETL job is supposed to process them in chronological order so that each day's records can reference IDs inserted by the previous day's run. It uses `pathlib.Path.glob()` to discover files.

Data engineers report that foreign-key violations appear roughly once a week in the staging database. The inserts fail because a record referencing a parent row is inserted before the parent row itself. The parent and child happen to live in adjacent daily files.

Manually re-running the job with the files in the correct order always succeeds. The team confirmed the files on disk have the correct timestamps, but the processing order logged at the start of each run is sometimes shuffled.

## Buggy code

```python
from pathlib import Path
import csv

def process_daily_files(data_dir: str) -> None:
    data_path = Path(data_dir)
    files = data_path.glob("*.csv")

    for csv_file in files:
        with open(csv_file, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                insert_row(row)  # inserts into staging DB

def insert_row(row: dict) -> None:
    pass  # stub
```
