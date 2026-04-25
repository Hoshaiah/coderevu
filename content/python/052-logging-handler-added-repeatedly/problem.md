---
slug: logging-handler-added-repeatedly
track: python
orderIndex: 52
title: Logger Handler Added on Every Call
difficulty: easy
tags:
  - correctness
  - logging
  - resource-management
language: python
---

## Context

`lib/logger.py` provides a `get_logger` convenience function used throughout the application. It is called at module import time in many files, and also called at the top of long-running worker functions to get a named logger with a consistent format. The function is intended to be safe to call multiple times with the same name.

Operators noticed that log lines are duplicated — sometimes the same message appears 4, 8, or 16 times in the log file, and the duplication gets worse the longer the process runs. Restarting the process resets the duplication temporarily. The formatting and content are correct; only the repetition is wrong.

The team confirmed the log file itself is not being written by multiple processes. The issue is in the logger setup code.

## Buggy code

```python
import logging
import sys

def get_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """
    Return a logger with a StreamHandler attached to stdout.
    Safe to call multiple times — always returns the same named logger.
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    formatter = logging.Formatter(
        "%(asctime)s %(name)s %(levelname)s %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    return logger
```
