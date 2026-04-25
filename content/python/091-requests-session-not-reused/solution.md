## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — HTTP Session Created Per Request
# ------------------------------------------------------------------------

import requests

API_BASE = "https://api.weather-example.com/v2"
API_KEY = "secret-api-key"

# CHANGE 1: Create a single module-level Session so the underlying urllib3 connection pool is reused across all calls, eliminating per-call TCP+TLS handshakes.
_session = requests.Session()
# CHANGE 2: Set the auth header once on the session rather than repeating it in every request; future credential rotation only needs one change.
_session.headers.update({"X-Api-Key": API_KEY})

def fetch_weather(lat: float, lon: float) -> dict:
    """
    Fetch current conditions for the given coordinates.
    """
    # CHANGE 1: Use the shared _session instead of the module-level requests.get shortcut so connection pooling takes effect.
    response = _session.get(
        f"{API_BASE}/current",
        params={"lat": lat, "lon": lon},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()

def enrich_records(records: list[dict]) -> list[dict]:
    for record in records:
        weather = fetch_weather(record["lat"], record["lon"])
        record["weather"] = weather
    return records
```

## Explanation

### Issue 1: New TCP+TLS Handshake Per Request

**Problem:** Every call to `fetch_weather` pays the full cost of a TCP three-way handshake plus a TLS negotiation before a single byte of HTTP data is exchanged. At 50,000 records per hour this doubles (or more) the wall-clock time per record, and the remote API server sees a flood of new connection attempts rather than reused keep-alive connections.

**Fix:** A `requests.Session` object named `_session` is created once at module load time, and `_session.get(...)` replaces the bare `requests.get(...)` call inside `fetch_weather`.

**Explanation:** `requests.get` is a convenience wrapper that internally creates a fresh `Session`, makes one request, and then discards it — including the underlying `urllib3` `HTTPAdapter` and its connection pool. A `requests.Session` holds an `HTTPAdapter` that keeps a pool of already-connected sockets open. After the first request warms the pool, subsequent calls to the same host reuse an existing socket and skip the handshake entirely. The module-level `_session` lives for the lifetime of the process, so every call in the enrichment loop shares that pool. One edge case to watch: if this code runs in a multi-process worker pool (e.g., with `multiprocessing`), each forked process gets its own copy of `_session`, which is correct and safe — but you'd lose pooling benefits if the session were somehow shared across OS-level processes.

---

### Issue 2: Auth Header Repeated at Every Call Site

**Problem:** The `X-Api-Key` header is passed as a `headers=` argument on every individual `requests.get` call. This is not a runtime performance issue, but it means that if the API key changes or a new auth mechanism is adopted, every call site must be updated.

**Fix:** `_session.headers.update({"X-Api-Key": API_KEY})` is called once after the session is created, and the `headers=` argument is removed from the `_session.get(...)` call inside `fetch_weather`.

**Explanation:** `requests.Session` merges its own `headers` dict with any per-request `headers` argument before sending. Setting the key once on the session means it is automatically included in every request the session makes, with no per-call repetition. This is the intended use of `Session.headers` and keeps authentication logic in one place. A related pitfall: if you later need to override the key for a specific request (e.g., for a different tenant), you can still pass `headers=` at the call level — the per-request value takes precedence over the session-level default.
