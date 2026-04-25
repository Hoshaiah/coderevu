## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — CSV reader leaks file handles when a row is malformed
# ------------------------------------------------------------------------
import csv

def extract_emails(path: str) -> list[str]:
    # CHANGE 1: use `with` so the file is closed even if an exception is raised
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        emails = []
        for row in reader:
            # CHANGE 2: skip rows that lack an "email" column instead of raising KeyError
            if "email" not in row:
                continue
            emails.append(row["email"].strip().lower())
    return emails
```

## Explanation

### Issue 1: File handle not closed on exception

**Problem:** When a row raises an exception (for example a `KeyError` because the `"email"` column is missing), execution jumps out of the `for` loop and `f.close()` is never reached. Each failed file leaves one file descriptor open. After enough files the process hits the OS limit (commonly 1024 open descriptors) and every subsequent `open()` call throws `OSError: [Errno 24] Too many open files`.

**Fix:** Replace the bare `open` + manual `f.close()` pattern with a `with open(...) as f:` block. The `with` statement calls `f.__exit__()` — which closes the file — whether the block exits normally or via an exception.

**Explanation:** Python's `open()` returns a file object whose reference count determines when the OS descriptor is released. Relying on `f.close()` at the end of a function is fragile because any exception thrown between `open` and `close` skips that line entirely. A `with` block installs a guaranteed cleanup handler via the context-manager protocol, so the descriptor is always released. A related pitfall: even if you wrap the body in `try/finally`, the `with` statement expresses the intent more clearly and is harder to accidentally break during future edits.

---

### Issue 2: Unguarded key access on malformed rows

**Problem:** If a CSV row does not contain an `"email"` column — for example a row with the wrong number of fields, or a file with different headers — `row["email"]` raises `KeyError`. The exception propagates out of the function, the file handle leaks (see Issue 1), and any email addresses collected so far are discarded rather than returned.

**Fix:** Add an `if "email" not in row: continue` guard before the `row["email"]` access. Rows missing the column are skipped silently, and processing continues with the remaining rows.

**Explanation:** `csv.DictReader` maps each row to a `dict` using the header line as keys. If a row has fewer fields than the header, the missing keys simply won't appear in the dict; if the header itself is wrong, none of the expected keys will be present. Rather than letting the function crash on the first bad row, checking for key presence lets the job recover gracefully and process as many valid addresses as possible. If strict validation is needed later, the `continue` can be replaced with a logging call or a counter without changing the surrounding structure.
