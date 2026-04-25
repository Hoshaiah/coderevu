---
slug: process-pool-lambda-unpicklable
track: python
orderIndex: 65
title: Lambda Breaks ProcessPoolExecutor
difficulty: medium
tags:
  - correctness
  - concurrency
  - multiprocessing
language: python
---

## Context

This batch-processing script lives in `jobs/score_batch.py`. It reads a large list of user feature vectors and uses `ProcessPoolExecutor` to score them in parallel across all CPU cores, then writes results to a CSV. It is run nightly by a cron job on a machine with 16 cores.

The job fails immediately with `AttributeError: Can't pickle local object 'run.<locals>.<lambda>'`. The developer added the lambda inline for brevity after an earlier refactor and cannot understand why it works fine when called directly but fails inside the executor.

Switching from `ProcessPoolExecutor` to `ThreadPoolExecutor` makes the error go away, so the developer assumed the problem was with the process pool implementation rather than with their code.

## Buggy code

```python
import csv
from concurrent.futures import ProcessPoolExecutor
from typing import Callable

def score_vector(features: list[float], threshold: float) -> dict:
    total = sum(f * (i + 1) for i, f in enumerate(features))
    return {"score": total, "pass": total >= threshold}

def run(input_rows: list[list[float]], threshold: float, workers: int = 4) -> list[dict]:
    scorer = lambda row: score_vector(row, threshold)
    results = []
    with ProcessPoolExecutor(max_workers=workers) as pool:
        for result in pool.map(scorer, input_rows):
            results.append(result)
    return results
```
