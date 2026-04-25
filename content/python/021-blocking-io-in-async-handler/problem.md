---
slug: blocking-io-in-async-handler
track: python
orderIndex: 21
title: Blocking I/O Inside Async Handler
difficulty: medium
tags:
  - concurrency
  - asyncio
  - performance
language: python
---

## Context

This route handler lives in `api/thumbnails.py` in a high-traffic FastAPI service that generates image thumbnails on demand. The service runs on a single-process Uvicorn worker and handles hundreds of requests per second at peak. The actual resizing is delegated to a utility function that wraps Pillow.

During a load test the team found that p99 latency spiked to several seconds even though the resize operation itself takes only 30–80 ms per image. Uvicorn metrics showed that request queue depth grew rapidly under load, suggesting the event loop was stalling. Reducing concurrency in the test brought latency back to normal.

A senior engineer already ruled out database contention and network I/O. CPU profiles showed the event loop thread was spending most of its time inside `resize_image`.

## Buggy code

```python
import asyncio
from pathlib import Path
from fastapi import APIRouter, HTTPException
from PIL import Image
import io

router = APIRouter()

def resize_image(source_path: str, width: int, height: int) -> bytes:
    with Image.open(source_path) as img:
        img = img.resize((width, height))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

@router.get("/thumbnail/{filename}")
async def get_thumbnail(filename: str, width: int = 128, height: int = 128):
    source = f"/var/media/originals/{filename}"
    if not Path(source).exists():
        raise HTTPException(status_code=404, detail="Image not found")

    data = resize_image(source, width, height)
    return {"size": len(data), "format": "png"}
```
