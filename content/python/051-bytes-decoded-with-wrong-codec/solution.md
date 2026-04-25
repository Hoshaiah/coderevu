## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Latin-1 Bytes Decoded as UTF-8
# ------------------------------------------------------------------------

import pathlib

def load_descriptions(filepath: str) -> list[dict]:
    """
    Parse a pipe-delimited product file into a list of records.
    Columns: sku|name|description|price
    """
    records = []
    raw_bytes = pathlib.Path(filepath).read_bytes()

    # CHANGE 1: Decode using 'latin-1' (ISO-8859-1) as documented by the vendor, not 'utf-8'; Latin-1 maps bytes 0x00-0xFF directly to the matching Unicode code points, so accented letters and symbols like £ (0xA3) and € are preserved correctly.
    try:
        text = raw_bytes.decode("latin-1")
    # CHANGE 2: Catch UnicodeDecodeError so a file that somehow contains invalid bytes does not abort the entire import; log the error and return whatever records were collected before the failure.
    except UnicodeDecodeError as exc:
        import logging
        logging.getLogger(__name__).error(
            "Failed to decode %s: %s", filepath, exc
        )
        return records

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

## Explanation

### Issue 1: Wrong Decode Encoding (Latin-1 vs UTF-8)

**Problem:** Product descriptions that contain characters above plain ASCII — accented letters like `é`, `ü`, `ñ`, and currency symbols like `£` (byte `0xA3`) and `€` — appear garbled in the database. UTF-8 represents these characters as multi-byte sequences, but the raw bytes from this vendor are single-byte Latin-1. When Python tries to interpret a Latin-1 byte sequence as UTF-8, it either raises a `UnicodeDecodeError` or misinterprets the bytes entirely.

**Fix:** Replace `"utf-8"` with `"latin-1"` in the `raw_bytes.decode(...)` call at `CHANGE 1`.

**Explanation:** ISO-8859-1 (Latin-1) is a single-byte encoding where every byte value from `0x00` to `0xFF` maps directly to the Unicode code point with the same number. UTF-8, by contrast, uses a variable-width scheme where values above `0x7F` are encoded as two or more bytes. When you call `.decode("utf-8")` on a Latin-1 file, Python sees bytes like `0xA3` (£) and cannot match them to a valid UTF-8 continuation sequence, producing a `UnicodeDecodeError` or replacement characters. Decoding with `"latin-1"` maps each byte to its matching Unicode code point one-to-one, which is exactly what the vendor's encoding guarantees. A related pitfall: if you use `errors="replace"` or `errors="ignore"` with UTF-8 as a workaround, the data silently loses information — the fix here avoids that by choosing the correct codec from the start.

---

### Issue 2: No Handling of Decode Failure

**Problem:** If the file contains any byte sequence that the chosen codec cannot decode — for example, a file that is corrupted or unexpectedly mixed-encoding — `raw_bytes.decode(...)` raises an unhandled `UnicodeDecodeError`. The Celery task propagates this exception, the entire batch import fails with zero records written, and the error may not surface prominently in monitoring.

**Fix:** Wrap the `decode` call in a `try/except UnicodeDecodeError` block at `CHANGE 2`. On failure, log the filepath and exception details with `logging.getLogger(__name__).error(...)` and return the (empty) `records` list so the caller gets a defined return value instead of an exception.

**Explanation:** A nightly import task that processes thousands of files should degrade gracefully when one file is unreadable rather than aborting the whole run. Catching `UnicodeDecodeError` specifically (rather than a bare `except`) keeps the handler narrow so other unexpected exceptions still propagate and get noticed. Logging the filepath and the exception message gives the on-call engineer enough detail to locate and re-process the bad file. Returning an empty list is consistent with the function's return type and lets the caller decide whether zero records from one file is worth an alert, without crashing the broader pipeline.
