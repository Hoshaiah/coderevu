## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Non-Constant Time Token Comparison
# ------------------------------------------------------------------------

import hashlib
import hmac

WEBHOOK_SECRET = b"super-secret-key"

def validate_webhook(
    body: bytes,
    signature_header: str,
) -> bool:
    expected = hmac.new(
        WEBHOOK_SECRET,
        body,
        hashlib.sha256,
    ).hexdigest()
    # CHANGE 1: Replace `==` with `hmac.compare_digest()` to perform a constant-time comparison, eliminating the timing side-channel that lets attackers reconstruct the HMAC byte-by-byte by measuring response latency.
    return hmac.compare_digest(expected, signature_header.strip().lower())
```

## Explanation

### Issue 1: Non-Constant-Time HMAC Comparison

**Problem:** The original code uses Python's `==` operator to compare the expected HMAC with the value from the request header. `==` short-circuits as soon as it finds the first differing character, so a request with a signature that matches the first N bytes takes measurably longer to reject than one that mismatches on byte 0. An attacker who can send many requests and time the responses can exploit this to reconstruct a valid signature one byte at a time, without ever knowing `WEBHOOK_SECRET`.

**Fix:** Replace `expected == signature_header` with `hmac.compare_digest(expected, signature_header.strip().lower())`. `hmac.compare_digest` is a constant-time equality check provided by Python's standard library specifically for this purpose.

**Explanation:** CPython's `==` on strings exits the loop the moment a mismatch is found, so comparisons that match more bytes take longer. Over thousands of requests an attacker measures these tiny latency differences — typically microseconds — and determines which candidate byte makes the comparison run longest, meaning it matched. They repeat this for each position until they have a fully valid signature. `hmac.compare_digest` always iterates over every byte of both strings before returning, so the execution time is the same regardless of where the first mismatch occurs. The additional `.strip().lower()` call normalises the incoming header before comparison, which prevents a different class of false-rejection bug where a provider sends uppercase hex or a trailing newline, but it does not introduce a timing leak because normalisation happens before the constant-time comparison, not inside it.
