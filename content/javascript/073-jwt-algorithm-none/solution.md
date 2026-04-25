## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — JWT verification accepts tokens signed with the 'none' algorithm, bypassing authentication
// ------------------------------------------------------------------------
const jwt = require("jsonwebtoken");
const SECRET = process.env.JWT_SECRET;

// CHANGE 2: Fail fast at module load time if the secret is missing, rather than allowing the server to start in a broken or insecure state.
if (!SECRET) {
  throw new Error("JWT_SECRET environment variable is not set. Refusing to start.");
}

function requireAuth(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing token" });

  // CHANGE 3: Validate the header format before splitting so a missing or malformed Bearer token returns a clean 401 instead of an unhandled crash.
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
    return res.status(401).json({ error: "Malformed authorization header" });
  }

  const token = parts[1];

  try {
    // CHANGE 1: Pass an explicit algorithms option that excludes 'none'. Without this, jsonwebtoken allows 'none' as a valid algorithm, which lets attackers forge tokens with no signature at all.
    const payload = jwt.verify(token, SECRET, { algorithms: ["HS256"] });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid token" });
  }
}

module.exports = requireAuth;
```

## Explanation

### Issue 1: `none` algorithm accepted by jwt.verify()

**Problem:** `jwt.verify()` in the `jsonwebtoken` package accepts the `none` algorithm by default if the library version or configuration permits it. An attacker crafts a JWT with `{"alg":"none"}` in the header, signs it with nothing, and the middleware calls it valid. Every admin endpoint becomes accessible without a real credential.

**Fix:** Pass `{ algorithms: ["HS256"] }` as the third argument to `jwt.verify()` at the `CHANGE 1` site. This whitelist tells the library to reject any token whose header declares an algorithm other than `HS256`.

**Explanation:** The JWT spec allows `alg: none` to mean "no signature required". The `jsonwebtoken` library honors this in some versions unless you explicitly restrict the allowed algorithms. When you pass `algorithms: ["HS256"]`, the library checks the token header before attempting verification and throws if the declared algorithm is not in your list. This closes the attack path entirely, regardless of library version. A related pitfall: if you ever switch to RS256 for asymmetric signing, you must update this list — mixing `HS256` and `RS256` in the same allowlist while accepting a public key as `SECRET` opens a separate key-confusion attack.

---

### Issue 2: Missing `JWT_SECRET` not caught at startup

**Problem:** If `JWT_SECRET` is not set in the environment, `SECRET` is `undefined`. Depending on the `jsonwebtoken` version, `jwt.verify(token, undefined)` may throw a generic error or behave unexpectedly. The server starts without any warning, and the bug only surfaces at runtime when a real request arrives.

**Fix:** At the `CHANGE 2` site, add a guard immediately after the `SECRET` assignment that throws an `Error` if `SECRET` is falsy. This kills the process at startup rather than letting it run in a broken state.

**Explanation:** Environment variables are easy to forget during deployment, especially across staging and production. A missing secret is a configuration error, not a per-request error, so it should be surfaced when the module loads, not when the first user hits the endpoint. Throwing at module load causes the process to exit immediately with a clear message, which makes the misconfiguration visible in deployment logs before any traffic is served. A subtlety: an empty string `""` is also falsy and equally insecure, so the `!SECRET` check catches that case too.

---

### Issue 3: Malformed Authorization header causes unhandled crash

**Problem:** If the `Authorization` header is present but lacks a space (e.g., just `"Bearer"` or a random string), `authHeader.split(" ")[1]` returns `undefined`. Passing `undefined` to `jwt.verify()` throws an error whose stack trace may leak internal details, and the behavior depends on error handling further up the chain rather than returning a clean 401.

**Fix:** At the `CHANGE 3` site, split the header into `parts`, then check that `parts` has exactly two elements, the first is `bearer` (case-insensitive), and the second is non-empty. Return a 401 immediately if any condition fails.

**Explanation:** HTTP clients and proxies sometimes send malformed headers due to bugs or misconfiguration. Relying on downstream code to handle `undefined` gracefully is fragile. The explicit format check makes the contract clear: the middleware expects `Bearer <token>` and rejects anything else with a predictable status code. The case-insensitive check on `parts[0]` is a small robustness improvement because RFC 7235 does not mandate a specific case for the scheme name.
