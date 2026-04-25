---
slug: datetime-strptime-format-cache-none
track: python
orderIndex: 94
title: strptime Cold-Cache in Hot Loop
difficulty: medium
tags:
  - perf
  - datetime
  - parsing
language: python
---

## Context

This function lives in `analytics/log_parser.py` and is the inner loop of an Apache log parser that processes millions of lines per run. It converts the log timestamp string (e.g. `"27/Mar/2024:12:00:01 +0000"`) into a Python `datetime` object for downstream bucketing.

After scaling the log volume by 10x, the parse job went from completing in 40 seconds to over 20 minutes. A `cProfile` run showed `_strptime._strptime` accounting for 85% of wall time, which surprised the team because they believed format-string compilation would be cached by Python automatically.

The team swapped `strptime` for a hand-rolled split on a branch but reverted it after it broke DST edge cases. They have not yet tried any other approach.

## Buggy code

```python
from datetime import datetime
from typing import Iterator

LOG_FMT = "%d/%b/%Y:%H:%M:%S %z"

def parse_timestamps(lines: Iterator[str]) -> list[datetime]:
    results = []
    for line in lines:
        # extract the timestamp field from Apache combined log format
        try:
            ts_str = line.split("[")[1].split("]")[0]
            dt = datetime.strptime(ts_str, LOG_FMT)
            results.append(dt)
        except (IndexError, ValueError):
            continue
    return results
```
