---
slug: csv-writer-flush-on-partial-write
track: python
orderIndex: 3
title: CSV Writer Silent Partial Flush
difficulty: easy
tags:
  - resource-management
  - file-io
  - buffering
language: python
---

## Context

This utility lives in `etl/export.py` and is responsible for writing processed records from an in-memory list to a CSV file on disk. It's invoked at the end of a daily batch job that consolidates user activity data before uploading the CSV to an S3 bucket.

Operations has noticed that the uploaded CSV files occasionally have the last few hundred rows missing — the file exists, is a valid CSV, and the headers are correct, but it's silently truncated. The job reports success and exits with code 0.

Checking S3 upload logs confirms the upload itself is fine: the truncation happens before the upload step. Adding explicit print statements showed the loop does iterate over all records.

## Buggy code

```python
import csv
import sys

def export_records(records: list[dict], output_path: str) -> None:
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        fieldnames = list(records[0].keys()) if records else []
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for record in records:
            writer.writerow(record)

def main():
    records = [{"user_id": i, "score": i * 1.5} for i in range(100_000)]
    export_records(records, "/tmp/output.csv")
    sys.exit(0)

if __name__ == "__main__":
    main()
```
