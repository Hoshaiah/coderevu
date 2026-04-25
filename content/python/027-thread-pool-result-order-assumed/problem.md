---
slug: thread-pool-result-order-assumed
track: python
orderIndex: 27
title: ThreadPool Results Assumed Ordered
difficulty: medium
tags:
  - concurrency
  - correctness
  - threading
language: python
---

## Context

`workers/image_processor.py` runs in a background Celery task that resizes uploaded images to three thumbnail sizes (small, medium, large) and stores the URLs in order in a JSON column. The three sizes are generated concurrently using a thread pool to reduce latency.

Users occasionally report that the thumbnail sizes are swapped — a request for the small thumbnail returns the large image, and vice versa. The bug is intermittent and only reproduces under load when the thread pool is busy with other tasks.

The image resizing logic itself has been confirmed correct via unit tests that run the sizes serially. The problem only manifests when the concurrent path is taken.

## Buggy code

```python
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

def resize_image(image_bytes: bytes, width: int) -> bytes:
    # Stub: resizes image to given width, returns bytes
    return image_bytes[:width]  # simplified

def generate_thumbnails(image_bytes: bytes) -> dict:
    sizes = {
        "small": 128,
        "medium": 512,
        "large": 1024,
    }
    results = []

    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = [
            executor.submit(resize_image, image_bytes, width)
            for width in sizes.values()
        ]
        for future in futures:
            results.append(future.result())

    return {
        "small": results[0],
        "medium": results[1],
        "large": results[2],
    }
```
