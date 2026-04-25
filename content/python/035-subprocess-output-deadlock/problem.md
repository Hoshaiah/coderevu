---
slug: subprocess-output-deadlock
track: python
orderIndex: 35
title: subprocess.PIPE Deadlock on Large Output
difficulty: hard
tags:
  - concurrency
  - resource-management
  - subprocess
language: python
---

## Context

This utility is in `tools/report_runner.py`. It invokes an external report-generation binary, captures its stdout, and returns the output to the web handler for download. The binary typically produces a few KB of output, but for large date ranges it can produce tens of megabytes.

For most requests the function returns quickly. For large date-range reports, the web worker hangs indefinitely and must be killed by the process supervisor. The issue was first seen when the product team added a 'full year' export option. Smaller date ranges — up to about a week — have never shown the issue.

The team verified the external binary itself does not hang: running it directly from the shell completes in seconds even for the full year. Stracing the Python process shows it blocked in `waitpid()` while the external process is blocked in `write()`.

## Buggy code

```python
import subprocess
import shlex
from datetime import date

def run_report(start: date, end: date, report_type: str) -> bytes:
    """
    Run the external report binary and return its stdout as bytes.
    """
    cmd = ["/usr/local/bin/report-gen",
           "--start", start.isoformat(),
           "--end", end.isoformat(),
           "--format", report_type]

    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    proc.wait()

    if proc.returncode != 0:
        raise RuntimeError(f"report-gen failed: {proc.stderr.read().decode()}")

    return proc.stdout.read()
```
