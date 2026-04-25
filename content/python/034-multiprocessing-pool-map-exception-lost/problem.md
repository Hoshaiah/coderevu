---
slug: multiprocessing-pool-map-exception-lost
track: python
orderIndex: 34
title: Worker Exception Silently Swallowed in Pool
difficulty: hard
tags:
  - concurrency
  - error-handling
  - multiprocessing
language: python
---

## Context

This module lives in `batch/image_resizer.py` and uses a multiprocessing pool to resize images in parallel. It's run as a nightly batch job that processes tens of thousands of images. The job is expected to raise an error and halt immediately if any worker fails so that operators can investigate corrupted source files.

Operators noticed the job sometimes completes successfully (exit code 0) and reports processing all images, but a subset of the output files are missing. Adding extra logging confirmed that some workers are raising exceptions — but those exceptions never reach the main process and the job never fails. The issue is most pronounced when a corrupt image appears near the end of the batch.

## Buggy code

```python
import multiprocessing
from pathlib import Path
from PIL import Image

def _resize_worker(args: tuple[str, str, tuple[int, int]]) -> None:
    src, dst, size = args
    with Image.open(src) as img:
        img.thumbnail(size)
        img.save(dst)

def resize_all(
    jobs: list[tuple[str, str, tuple[int, int]]],
    workers: int = 4,
) -> None:
    pool = multiprocessing.Pool(processes=workers)
    result = pool.map_async(_resize_worker, jobs)
    pool.close()
    # Wait up to 10 minutes for the whole batch
    result.wait(timeout=600)
    pool.join()
```
