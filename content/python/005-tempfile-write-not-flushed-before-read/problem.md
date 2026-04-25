---
slug: tempfile-write-not-flushed-before-read
track: python
orderIndex: 5
title: Tempfile Write Not Flushed Before Read
difficulty: easy
tags:
  - resource-management
  - file-io
  - correctness
language: python
---

## Context

This utility lives in `utils/validation.py` and is used by an API endpoint that accepts a JSON config payload, writes it to a temporary file, then passes the file path to a third-party CLI validator tool. The function returns the validator's stdout so the endpoint can surface errors to the caller.

In testing, the validator consistently reports `"empty or unreadable config"` even when a valid config body is posted. Adding print-debugging shows the payload is received correctly and the `tempfile.NamedTemporaryFile` object is created successfully. The validator binary itself works fine when given a real file on disk.

## Buggy code

```python
import subprocess
import tempfile

def validate_config(config_json: str) -> str:
    tmp = tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".json",
        delete=False,
        encoding="utf-8",
    )
    tmp.write(config_json)
    result = subprocess.run(
        ["config-validator", "--file", tmp.name],
        capture_output=True,
        text=True,
    )
    tmp.close()
    return result.stdout
```
