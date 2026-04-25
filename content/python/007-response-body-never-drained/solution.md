## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — HTTP Response Body Never Read
# ------------------------------------------------------------------------

import requests

_session = requests.Session()

def authorise(card_token: str, amount_cents: int) -> dict:
    resp = _session.post(
        "https://pay.example.com/v1/authorise",
        json={"token": card_token, "amount": amount_cents},
        timeout=5,
    )
    if resp.status_code != 200:
        # CHANGE 1: Always consume the response body before raising so the socket is released back to the connection pool; include body text in the error for CHANGE 2 debuggability.
        body = resp.text
        raise RuntimeError(f"Gateway error: {resp.status_code} – {body}")
    # only read the body on success — skip parsing on non-200
    return resp.json()
```

## Explanation

### Issue 1: Unconsumed Response Drains Connection Pool

**Problem:** After 10–15 minutes under load, calls start timing out with `HTTPSConnectionPool ... Read timed out`. The payment gateway confirms it is healthy and returning responses. Only the first call in each batch succeeds; subsequent ones stall waiting for a free connection.

**Fix:** Before raising `RuntimeError`, the fix reads `resp.text` (assigned to `body`). This forces the `requests` library to drain the response body from the socket, which allows the socket to be returned to `urllib3`'s connection pool for reuse.

**Explanation:** When `requests` sends an HTTP request over a persistent (keep-alive) connection, the server streams the response headers first and then the body. If the client reads the headers (which `resp.status_code` does) but never reads the body, the socket sits in a half-read state. `urllib3` cannot safely reuse or close it, so it parks the socket as "in use". The default `pool_maxsize` is 10, so after 10 non-200 responses the pool is full and every subsequent call blocks waiting for a slot that never frees. Calling `resp.text`, `resp.content`, or `resp.json()` drains the remaining bytes from the socket so `urllib3` marks it as reusable. Alternatively, calling `resp.close()` discards the remaining bytes and closes the connection, which also frees the slot but forgoes keep-alive reuse.

---

### Issue 2: Error Path Discards Gateway Error Detail

**Problem:** When the gateway returns a non-200 status, the `RuntimeError` only contains the status code. The gateway's response body — which typically includes a machine-readable error code and a human-readable message — is thrown away, making incident investigation require vendor log access.

**Fix:** The fix captures `resp.text` into `body` and interpolates it into the `RuntimeError` message: `f"Gateway error: {resp.status_code} – {body}"`. This is the same line introduced for the connection-pool fix, so no extra read is needed.

**Explanation:** Most HTTP APIs encode error detail in the response body as JSON or plain text (e.g. `{"error": "card_declined", "decline_code": "insufficient_funds"}`). Reading `resp.text` both drains the socket (solving Issue 1) and gives the caller useful diagnostic information. If the error body is binary or very large, `resp.text[:500]` limits the message size. Using `resp.json()` instead would fail if the error body is not valid JSON, so `resp.text` is the safer choice for the error branch.
