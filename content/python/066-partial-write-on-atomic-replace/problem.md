---
slug: partial-write-on-atomic-replace
track: python
orderIndex: 66
title: Non-Atomic Config File Write
difficulty: medium
tags:
  - correctness
  - file-io
  - crash-safety
language: python
---

## Context

This function is in `config/persistence.py` and is called whenever a user saves new application settings through the admin UI. It serialises the settings dict to JSON and writes it to a well-known path on disk. The file is read at startup and by several background threads that periodically reload it.

A handful of users have reported that after their browser crashed or the server restarted mid-save, the config file is either empty or contains truncated JSON. On the next startup the application fails with `json.JSONDecodeError` and cannot start at all without manual intervention to restore the file from backup.

The team has already added a startup check that validates the JSON before the app fully initialises, but the root problem — the file ending up corrupt — has not been addressed.

## Buggy code

```python
import json
import os

CONFIG_PATH = "/etc/myapp/config.json"

def save_config(settings: dict) -> None:
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
```
