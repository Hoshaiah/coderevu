## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — enumerate Start Causes Wrong Line Numbers
# ------------------------------------------------------------------------

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

    # CHANGE 1: start=1 makes lineno 1-based, matching editor/CI conventions; previously enumerate defaulted to start=0.
    for lineno, line in enumerate(lines, start=1):
        for pattern, message in FORBIDDEN_PATTERNS:
            if re.search(pattern, line):
                violations.append({
                    "file": path,
                    # CHANGE 2: lineno is now already 1-based from enumerate(start=1), so it is stored directly without any off-by-one.
                    "line": lineno,
                    "message": message,
                })
    return violations
```

## Explanation

### Issue 1: `enumerate` Default Start Is Zero

**Problem:** Every violation is reported one line number lower than the actual offending line. If a forbidden pattern sits on line 5, the tool reports line 4. This is consistent across all files because the root cause is a fixed offset of -1 applied to every line.

**Fix:** Change `enumerate(lines)` to `enumerate(lines, start=1)` so that `lineno` begins at 1 instead of 0.

**Explanation:** Python's `enumerate` defaults to `start=0`, meaning the first line of the file gets `lineno=0`, the second gets `lineno=1`, and so on. Most editors, compilers, and CI tools treat line numbers as 1-based, so line 1 is the first line. Reporting a 0-based index directly produces a consistent off-by-one error for every single match. Passing `start=1` shifts the counter so the first iteration yields `lineno=1`, the second yields `lineno=2`, and the mapping is now correct without any arithmetic elsewhere in the code.

---

### Issue 2: Violation Dict Stores Raw Enumerate Index

**Problem:** Even after fixing the `enumerate` start value, the `"line"` key in the violation dict must store the corrected value. In the original code `lineno` was the 0-based index and was stored as-is, compounding the off-by-one in the output.

**Fix:** Keep `"line": lineno` in the `violations.append(...)` call. Once Issue 1 is resolved and `lineno` is already 1-based, no further transformation is needed at the storage site — the value is correct as-is.

**Explanation:** The bug and the storage site are coupled: the wrong value came in from `enumerate` and was written out unchanged. After fixing `enumerate(lines, start=1)`, `lineno` holds the correct 1-based number at every iteration, so `"line": lineno` now records the right line number. A tempting but error-prone alternative would have been to leave `enumerate` at its default and write `"line": lineno + 1` at the storage site; that would also produce correct output, but it hides the intent and is easy to get wrong if the code is refactored later. Using `start=1` makes the invariant explicit at the loop declaration.
