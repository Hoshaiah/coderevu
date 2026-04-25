---
slug: bytes-decoded-with-wrong-codec
track: python
orderIndex: 51
title: Latin-1 Bytes Decoded as UTF-8
difficulty: easy
tags:
  - correctness
  - encoding
  - data-pipeline
language: python
---

## Context

`etl/legacy_import.py` reads product description files exported by a vendor's legacy ERP system. The vendor documents that all files use ISO-8859-1 (Latin-1) encoding. The function below is called by a nightly Celery task that ingests thousands of product records into the main database.

Customers occasionally report that product descriptions for items with special characters (accented letters, currency symbols like `£` and `€`) show up garbled — replaced by sequences of odd characters or question marks. The issue affects only records from this vendor; other import pipelines are fine.

The on-call engineer checked the database column's collation and the HTTP response headers of the API that serves the data downstream — both are UTF-8, and that's not the problem. The bug is in how the raw bytes are decoded before the data ever reaches the database.

## Buggy code

```python
import pathlib

def load_descriptions(filepath: str) -> list[dict]:
    """
    Parse a pipe-delimited product file into a list of records.
    Columns: sku|name|description|price
    """
    records = []
    raw_bytes = pathlib.Path(filepath).read_bytes()

    # Decode and split into lines
    text = raw_bytes.decode("utf-8")

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 4:
            continue
        sku, name, description, price = parts
        records.append({
            "sku": sku.strip(),
            "name": name.strip(),
            "description": description.strip(),
            "price": price.strip(),
        })
    return records
```
