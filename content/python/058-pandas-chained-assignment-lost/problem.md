---
slug: pandas-chained-assignment-lost
track: python
orderIndex: 58
title: Chained Pandas Assignment Silently Lost
difficulty: easy
tags:
  - correctness
  - pandas
  - data-processing
language: python
---

## Context

This transformation lives in `etl/user_segmentation.py` and is part of an ETL pipeline that prepares a user DataFrame for downstream ML feature engineering. It reads a raw DataFrame of user records from a Parquet file, cleans up the `signup_source` column by normalizing unknown values to `"organic"`, then applies a revenue tier label. The result is written back to a staging table in BigQuery.

Data scientists have complained that the `signup_source` column in the output always contains the original raw values — the normalization step appears to have no effect. The pipeline runs without errors or warnings (depending on the pandas version and `mode.chained_assignment` setting), so the bug went unnoticed in testing. Downstream models trained on this data have an unexpectedly high cardinality in the `signup_source` feature.

The team confirmed the raw Parquet files do contain invalid values like `"unknown"` and `None`. They also verified the BigQuery write step is working correctly by checking other columns that are transformed without issue.

## Buggy code

```python
import pandas as pd

def prepare_users(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize signup_source and add revenue_tier column.
    """
    # Replace unknown/null signup sources with 'organic'
    df[df["signup_source"].isna()]["signup_source"] = "organic"
    df[df["signup_source"] == "unknown"]["signup_source"] = "organic"

    # Add revenue tier based on lifetime value
    df["revenue_tier"] = pd.cut(
        df["lifetime_value_usd"],
        bins=[0, 100, 1000, float("inf")],
        labels=["low", "mid", "high"],
    )
    return df

def run_etl(parquet_path: str) -> pd.DataFrame:
    df = pd.read_parquet(parquet_path)
    df = prepare_users(df)
    return df
```
