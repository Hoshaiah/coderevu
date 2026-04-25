## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Exhausted Iterator Passed to Two Consumers
# ------------------------------------------------------------------------

import itertools
from typing import Iterable, Iterator

def _dedup(records: Iterable[dict]) -> Iterator[dict]:
    seen = set()
    for rec in records:
        if rec["id"] not in seen:
            seen.add(rec["id"])
            yield rec

def _write_records(records: Iterable[dict], path: str) -> None:
    with open(path, "w") as f:
        for rec in records:
            f.write(str(rec) + "\n")

def merge_and_write(
    source_a: Iterable[dict],
    source_b: Iterable[dict],
    output_path: str,
) -> int:
    merged = _dedup(itertools.chain(source_a, source_b))
    # CHANGE 1: Materialise the lazy generator into a list so both the write step and the count step can consume it; a generator is exhausted after one pass, so reusing `merged` directly gives an empty second iteration.
    records = list(merged)
    # CHANGE 2: Count and write from the same materialised list instead of the now-exhausted generator, ensuring `_write_records` actually receives all records.
    count = len(records)
    _write_records(records, output_path)
    return count
```

## Explanation

### Issue 1: Generator Exhausted Before Write

**Problem:** The output file is always empty even though the logged record count is correct. `_write_records()` is called but produces no output because it receives a generator that has already been fully consumed.

**Fix:** Replace `merged` (a one-shot generator) with `records = list(merged)` at CHANGE 1, materialising all deduplicated records into a list before either consumer touches them.

**Explanation:** `_dedup()` returns a generator — a lazy iterator that produces each value once and remembers its position. When `sum(1 for _ in merged)` runs, it advances that generator all the way to the end. The generator's internal state now sits at "exhausted". When `_write_records(merged, ...)` is called next, it calls `next()` on the same object and immediately gets `StopIteration`, so the `for` loop body never executes and nothing is written. Converting to a `list` forces all values out of the generator up front and stores them in memory, so both `len()` and `_write_records()` see the full set of records. The one trade-off is that all deduplicated records must fit in memory at once; for very large datasets a tee or a single-pass accumulator would be preferable.

---

### Issue 2: Count Derived from Exhausted Source Instead of Materialised Data

**Problem:** Even after fixing the exhaustion bug, using `sum(1 for _ in merged)` after converting to a list is unnecessary overhead. More importantly, in the original code the count appears correct only because it runs first — a misleading situation that hides the real bug during debugging.

**Fix:** At CHANGE 2, replace `sum(1 for _ in merged)` with `len(records)`, where `records` is the materialised list from CHANGE 1, and move `_write_records(records, output_path)` to consume the same list.

**Explanation:** Once `records` is a `list`, `len(records)` gives the count in O(1) with no iteration at all, removing any risk of a second exhaustion. Calling `_write_records(records, ...)` with the list means the function iterates over an ordinary sequence that can be traversed any number of times. The original code's count appearing "correct" was coincidental — the count consumer ran first, so it saw all records, while the write consumer silently got none. Swapping the order of the two calls in the original code would have made the file correct but the count zero, which reveals the real issue: two consumers cannot share one generator without one of them being materialised first.
