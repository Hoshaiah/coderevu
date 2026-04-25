---
slug: generator-exhaustion-reuse
track: python
orderIndex: 62
title: >-
  Reusing an exhausted generator silently produces empty results on the second
  pass
difficulty: medium
tags:
  - correctness
  - python-gotcha
  - iterators
language: python
---

## Context

This ETL utility reads a large JSONL file as a generator to avoid loading everything into memory, then runs two passes: one to compute aggregate statistics and one to write filtered records to an output file. It's called nightly on files that can be several gigabytes.

The output files are consistently empty, but no exception is raised and the statistics pass returns correct results.

## Buggy code

```python
import json
from typing import Generator

def iter_records(path: str) -> Generator[dict, None, None]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

def process_jsonl(input_path: str, output_path: str, min_score: float) -> dict:
    records = iter_records(input_path)

    total = 0
    score_sum = 0.0
    for rec in records:
        total += 1
        score_sum += rec.get("score", 0.0)

    stats = {"total": total, "avg_score": score_sum / total if total else 0.0}

    with open(output_path, "w", encoding="utf-8") as out:
        for rec in records:  # generator already exhausted!
            if rec.get("score", 0.0) >= min_score:
                out.write(json.dumps(rec) + "\n")

    return stats
```
