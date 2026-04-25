---
slug: gzip-file-not-closed-on-error
track: python
orderIndex: 2
title: GzipFile Leaks Handle on Write Error
difficulty: easy
tags:
  - resource-management
  - exceptions
  - io
language: python
---

## Context

This function lives in `etl/exporters/compressed_writer.py` and is responsible for writing batches of JSON-encoded records to gzip-compressed files on a shared NFS mount. It's called thousands of times per day by a multi-threaded export worker.

After several hours of operation, workers begin failing with `OSError: [Errno 24] Too many open files`. A thread dump shows a large number of open `.gz` file descriptors. The issue never happens in local testing because the test dataset is small enough that errors are rare.

## Buggy code

```python
import gzip
import json

def write_compressed_batch(path: str, records: list[dict]) -> None:
    gz = gzip.open(path, "wt", encoding="utf-8")
    for record in records:
        line = json.dumps(record) + "\n"
        gz.write(line)
    gz.close()
```
