---
slug: readline-strips-trailing-newline-check
track: python
orderIndex: 55
title: EOF Detection on Stripped Lines
difficulty: easy
tags:
  - correctness
  - file-io
  - api-misuse
language: python
---

## Context

`parsers/log_tail.py` implements a simple log-file follower used in a monitoring daemon. It reads new lines from a growing log file and feeds them to an alerting pipeline. The function is called in a polling loop every few seconds.

The monitoring team reports that alerts are occasionally duplicated — the same log line triggers the alert twice. Tracing shows that certain lines are processed in one poll cycle and then re-processed in the next.

The bug only manifests for lines that are written to the log file without a trailing newline (e.g., the very last line before a flush). The position tracking was assumed to be correct because it uses `f.tell()`.

## Buggy code

```python
def read_new_lines(path: str, last_pos: int) -> tuple[list[str], int]:
    lines = []
    with open(path, "r", encoding="utf-8") as f:
        f.seek(last_pos)
        while True:
            line = f.readline()
            if line == "":
                # EOF reached
                break
            # Strip the newline before storing
            stripped = line.strip("\n")
            if stripped == "":
                # Skip blank lines
                break
            lines.append(stripped)
        new_pos = f.tell()
    return lines, new_pos
```
