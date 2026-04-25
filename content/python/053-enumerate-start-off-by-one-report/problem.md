---
slug: enumerate-start-off-by-one-report
track: python
orderIndex: 53
title: enumerate Start Causes Wrong Line Numbers
difficulty: easy
tags:
  - correctness
  - cli
  - off-by-one
language: python
---

## Context

`tools/lint_checker.py` is a simple linter that scans source files for forbidden patterns and reports the line number of each violation. The reported line numbers are used by editors and CI systems to jump directly to the offending line. Line numbers in most editors and tools are 1-based.

Users reported that every violation is reported one line higher than the actual offending line — if the bad pattern is on line 5, the tool reports line 4. The pattern matching itself is correct; the wrong line number is the only problem. The issue is consistent and reproducible across all files and patterns.

The team verified that the file is read correctly and that the matching logic is sound. The bug is in the line-number accounting.

## Buggy code

```python
import re
from pathlib import Path

FORBIDDEN_PATTERNS = [
    (r"eval\s*\(", "use of eval() is forbidden"),
    (r"exec\s*\(", "use of exec() is forbidden"),
    (r"__import__\s*\(", "dynamic import is discouraged"),
]

def check_file(path: str) -> list[dict]:
    """
    Return a list of violations found in the file.
    Each violation: {"file": str, "line": int, "message": str}
    """
    violations = []
    lines = Path(path).read_text(encoding="utf-8").splitlines()

    for lineno, line in enumerate(lines):
        for pattern, message in FORBIDDEN_PATTERNS:
            if re.search(pattern, line):
                violations.append({
                    "file": path,
                    "line": lineno,
                    "message": message,
                })
    return violations
```
