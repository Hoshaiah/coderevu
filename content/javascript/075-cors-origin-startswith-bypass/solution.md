## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — CORS Origin Check Bypassable
// ------------------------------------------------------------------------

const ALLOWED_ORIGIN = 'https://app.example.com';

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;

  // CHANGE 1: Replace startsWith with strict equality so that origins like https://app.example.com.evil.org are rejected; startsWith was the bypass vector.
  if (origin && origin === ALLOWED_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

    // CHANGE 2: Move the OPTIONS preflight response inside the origin guard so that only requests from the real origin receive a 204 with CORS headers; requests from other origins fall through and get no CORS grant.
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
  }

  next();
}

module.exports = corsMiddleware;
```

## Explanation

### Issue 1: `startsWith` Enables Origin Prefix Bypass

**Problem:** The server responds with `Access-Control-Allow-Origin: https://app.example.com.evil.org` for any origin whose string starts with `https://app.example.com`. A browser seeing that header permits the cross-origin request and attaches cookies/credentials, so an attacker's page at `https://app.example.com.evil.org` can make authenticated API calls on behalf of the victim.

**Fix:** Replace `origin.startsWith(ALLOWED_ORIGIN)` with strict equality `origin === ALLOWED_ORIGIN`. Only the exact string `'https://app.example.com'` now passes.

**Explanation:** `String.prototype.startsWith` checks whether the string begins with the given prefix, not whether it equals it. `'https://app.example.com.evil.org'.startsWith('https://app.example.com')` returns `true` because the attacker's domain happens to open with the legitimate domain as a prefix. The team believed the check was safe because no wildcard characters were present, but prefix matching is its own form of partial match. Strict equality (`===`) has no such ambiguity — the entire string must match. A related pitfall is using a regex like `/https:\/\/app\.example\.com/` without anchoring it to the end, which has the same problem; always anchor or use equality.

---

### Issue 2: OPTIONS Preflight Handled Outside the Origin Guard

**Problem:** In the original code the `OPTIONS` branch sits after the `if`-block that sets CORS headers, so it executes regardless of whether the origin was allowed. A request from a disallowed origin still receives a `204` response. While no CORS headers are included in that `204`, the structural separation means that any future developer who adds a header inside the `OPTIONS` block could inadvertently grant access without realising the guard does not apply.

**Fix:** Move the `if (req.method === 'OPTIONS') { return res.sendStatus(204); }` block inside the origin-equality guard, as shown at the CHANGE 2 site. Requests from disallowed origins now fall through to `next()` with no CORS headers and no short-circuit `204`.

**Explanation:** Security-critical branches should be co-located with the condition that authorises them. When the preflight handler lives outside the guard, a reader must mentally track two separate control-flow paths to understand the combined effect. Moving it inside makes the intent explicit: only an approved origin gets both the CORS headers and the preflight acknowledgment. Requests from other origins reach `next()`, which will typically result in the actual route handler running without any CORS headers set — the browser will block the response on the client side, which is the correct outcome.
