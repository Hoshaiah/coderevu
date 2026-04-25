## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Pickle Deserializes Untrusted User Data
# ------------------------------------------------------------------------

import hmac
import hashlib
import json
import base64
import os
from flask import request, abort

# CHANGE 1: Replace pickle with JSON for session serialization so no executable bytecode is ever deserialized from user-supplied data.
SESSION_SECRET = os.environ.get("SESSION_SECRET", "change-me-in-production")

def _sign(payload: bytes) -> str:
    """Return base64(payload) + '.' + HMAC-SHA256 signature."""
    sig = hmac.new(SESSION_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(payload).decode() + "." + sig

def _verify_and_decode(cookie: str) -> bytes:
    # CHANGE 2: Verify HMAC signature before touching the payload, so tampered or forged cookies are rejected before any parsing occurs.
    try:
        encoded, sig = cookie.rsplit(".", 1)
    except ValueError:
        abort(400)
    payload = base64.urlsafe_b64decode(encoded)
    expected = hmac.new(SESSION_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    # CHANGE 2: Use hmac.compare_digest to prevent timing-based signature forgery attacks.
    if not hmac.compare_digest(expected, sig):
        abort(401)
    return payload

def restore_session(session_cookie: str) -> dict:
    """
    Decode a session cookie and restore the session object.
    The cookie value is base64url(JSON bytes) + '.' + HMAC-SHA256 signature.
    """
    # CHANGE 1: Parse with json.loads instead of pickle.loads — JSON cannot execute code regardless of payload content.
    # CHANGE 2: Payload is only parsed after HMAC verification confirms it was produced by this server.
    try:
        raw = _verify_and_decode(session_cookie)
        session = json.loads(raw)
        if not isinstance(session, dict):
            abort(400)
        return session
    except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
        abort(400)

def get_current_user():
    cookie = request.cookies.get("session", "")
    if not cookie:
        abort(401)
    session = restore_session(cookie)
    return session.get("user_id")
```

## Explanation

### Issue 1: Pickle Deserialization of Attacker-Controlled Data

**Problem:** The cookie value is supplied by the browser on every request. An attacker crafts a cookie whose base64-decoded bytes contain a pickle payload with a `__reduce__` method that runs arbitrary shell commands. When `pickle.loads` processes it, Python executes the embedded code — no exploit of Redis or the network is needed at all.

**Fix:** Replace `pickle.loads` with `json.loads` throughout `restore_session` and `_verify_and_decode`. The import of `pickle` is removed entirely and `json` is imported instead. Session data is stored and read as UTF-8 JSON text.

**Explanation:** `pickle` is a code-execution format by design: it supports arbitrary Python objects by encoding callable references and arguments that Python invokes on load. An attacker who controls the bytes passed to `pickle.loads` controls what code runs in the server process. JSON has no such mechanism — `json.loads` builds only dicts, lists, strings, numbers, booleans, and None. If the session object genuinely requires custom Python types, those types should be flattened to a JSON-representable dict on write and reconstructed on read using normal constructor logic, keeping deserialization deterministic and data-only.

---

### Issue 2: Missing Integrity Check on the Cookie Payload

**Problem:** Even after switching to JSON, the server still blindly parses whatever bytes the client sends. An attacker can forge a session cookie for any `user_id` simply by base64-encoding a JSON dict with the desired value. There is no signature, so the server cannot tell whether it produced the cookie or the attacker did.

**Fix:** Add `_sign` and `_verify_and_decode` functions that append an HMAC-SHA256 signature to every cookie on issue and verify it before parsing on every request. `hmac.compare_digest` is used for the comparison to prevent timing attacks.

**Explanation:** Without a server-side secret, the cookie is a self-describing token that anyone can construct. HMAC ties the payload to a secret only the server knows: to forge a valid signature the attacker must know `SESSION_SECRET`, which they do not. The signature is verified before `json.loads` runs, so a tampered payload is rejected before any parsing work happens. `hmac.compare_digest` is important here because a naive `==` comparison short-circuits on the first differing byte, leaking timing information that can be used to guess the correct signature one byte at a time.
