---
slug: leaky-csv-reader
track: python
orderIndex: 1
title: "CSV reader leaks file handles when a row is malformed"
difficulty: easy
tags: [resource-management, exceptions]
language: python
---

## Context

This helper loads a CSV of user records and returns a list of email addresses. It's called from a nightly job that processes hundreds of files. Ops has noticed the job occasionally fails with `OSError: [Errno 24] Too many open files` after running for a while.

## Buggy code

```python
import csv

def extract_emails(path: str) -> list[str]:
    f = open(path, "r", encoding="utf-8")
    reader = csv.DictReader(f)
    emails = []
    for row in reader:
        emails.append(row["email"].strip().lower())
    f.close()
    return emails
```
