## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Reusing an exhausted generator silently produces empty results on the second pass
# ------------------------------------------------------------------------
import json
from typing import Generator

def iter_records(path: str) -> Generator[dict, None, None]:
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)

def process_jsonl(input_path: str, output_path: str, min_score: float) -> dict:
    # CHANGE 1: First pass uses its own fresh generator so the second pass gets a separate, independent generator that starts from the beginning.
    stats_records = iter_records(input_path)

    total = 0
    score_sum = 0.0
    for rec in stats_records:
        total += 1
        score_sum += rec.get("score", 0.0)

    stats = {"total": total, "avg_score": score_sum / total if total else 0.0}

    # CHANGE 1: Second pass creates a new generator call so the file is re-opened and iterated from scratch, independent of the first pass.
    filter_records = iter_records(input_path)

    with open(output_path, "w", encoding="utf-8") as out:
        for rec in filter_records:
            if rec.get("score", 0.0) >= min_score:
                out.write(json.dumps(rec) + "\n")

    # CHANGE 2: Raise an explicit error when the file contained no records so callers are not silently misled by a zero avg_score.
    if total == 0:
        raise ValueError(f"No records found in {input_path!r}; output file will be empty.")

    return stats
```

## Explanation

### Issue 1: Generator Exhausted Before Second Pass

**Problem:** The output file is always empty even though the statistics pass returns correct numbers. The nightly job writes zero bytes to the output file without raising any error, so operators have no idea filtering failed.

**Fix:** Replace the single `records = iter_records(input_path)` call with two separate calls: `stats_records = iter_records(input_path)` for the first loop and `filter_records = iter_records(input_path)` for the second loop, each assigned at the point of use.

**Explanation:** `iter_records` returns a generator object. A generator maintains internal state — once `next()` has been called until `StopIteration`, it is permanently exhausted. The first `for rec in records` loop drains the generator completely. When the second `for rec in records` loop starts, Python calls `next()` on the same exhausted object, which immediately raises `StopIteration`, so the loop body never executes and nothing is written. Calling `iter_records(input_path)` a second time creates a brand-new generator object that re-opens the file and starts reading from byte 0, giving the filter pass a full, independent stream of records. A related pitfall: if you convert the generator to a `list` for the first pass, you can iterate the list twice, but that loads the entire file into memory — not acceptable for multi-gigabyte files.

---

### Issue 2: Silent Zero-Record Case Produces Misleading Output

**Problem:** If `input_path` exists but is empty or contains only blank lines, `total` stays `0`, `avg_score` is `0.0`, and the function returns normally. The caller has no way to distinguish "file processed, all records scored 0" from "file was empty, nothing happened".

**Fix:** After computing `stats`, add `if total == 0: raise ValueError(...)` to signal explicitly that no records were processed, referencing `input_path` in the message so operators can act on the information.

**Explanation:** The original code already guards against division by zero with the ternary `score_sum / total if total else 0.0`, which is correct arithmetic hygiene. But returning `{"total": 0, "avg_score": 0.0}` without complaint means the nightly monitoring system sees a successful run with plausible-looking numbers. Raising `ValueError` makes the failure visible in logs and alerting pipelines. The check goes after the stats computation rather than before so the stats dict is still populated for any debug logging the caller might do before re-raising.
