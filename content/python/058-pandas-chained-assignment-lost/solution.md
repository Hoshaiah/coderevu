## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Chained Pandas Assignment Silently Lost
# ------------------------------------------------------------------------

import pandas as pd

def prepare_users(df: pd.DataFrame) -> pd.DataFrame:
    """
    Normalize signup_source and add revenue_tier column.
    """
    # CHANGE 1: Use .loc with a boolean mask to assign in-place on the original DataFrame instead of chained indexing on a temporary copy.
    df.loc[df["signup_source"].isna(), "signup_source"] = "organic"
    # CHANGE 2: Use .loc with a boolean mask to assign in-place on the original DataFrame instead of chained indexing on a temporary copy.
    df.loc[df["signup_source"] == "unknown", "signup_source"] = "organic"

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

## Explanation

### Issue 1: NaN replacement lost via chained indexing

**Problem:** The line `df[df["signup_source"].isna()]["signup_source"] = "organic"` has no effect on `df`. Rows where `signup_source` is `None`/`NaN` keep their original null value in the output, so downstream consumers see nulls they were not expecting.

**Fix:** Replace the chained index expression with `df.loc[df["signup_source"].isna(), "signup_source"] = "organic"`, which targets the rows and column in a single indexing operation on the original DataFrame.

**Explanation:** The expression `df[df["signup_source"].isna()]` calls `__getitem__` on `df` and returns either a view or a copy depending on internal pandas memory layout — pandas makes no guarantee which one you get. When it returns a copy, the subsequent `["signup_source"] = "organic"` writes into that temporary object and is immediately discarded; `df` is untouched. `df.loc[mask, column] = value` is a single `__setitem__` call routed directly through the DataFrame's indexing machinery, so pandas always modifies the original object. Pandas may emit a `SettingWithCopyWarning` for the old pattern in some versions, but with `mode.chained_assignment` set to `None` (or in newer pandas that removed the warning) no diagnostic appears, making the bug invisible at runtime.

---

### Issue 2: 'unknown' replacement lost via chained indexing

**Problem:** The line `df[df["signup_source"] == "unknown"]["signup_source"] = "organic"` also has no effect on `df`. Rows containing the string `"unknown"` are passed through to the output unchanged, causing unexpectedly high cardinality in `signup_source` for downstream ML models.

**Fix:** Replace the chained index expression with `df.loc[df["signup_source"] == "unknown", "signup_source"] = "organic"`, targeting rows and column together in one `.loc` call on the original DataFrame.

**Explanation:** This is the same root mechanism as Issue 1. `df[df["signup_source"] == "unknown"]` produces an intermediate object; assigning to a column on that intermediate object writes nowhere persistent. Because Issue 1 runs first and converts `NaN` values to `"organic"` (once fixed), the mask for Issue 2 only needs to match literal `"unknown"` strings — the two fixes are independent but together cover all the normalization cases. A common related pitfall is assuming that because `df["revenue_tier"] = ...` works (single-step `__setitem__`), the two-step chained form must also work; the difference is that the single-step form calls `__setitem__` directly on `df`, while the chained form calls `__getitem__` first, losing the reference to `df`.
