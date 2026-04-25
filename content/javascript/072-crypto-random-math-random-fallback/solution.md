## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Math.random Fallback in Token Generation
// ------------------------------------------------------------------------

const TOKEN_LENGTH = 32;

// CHANGE 2: Import Node's built-in crypto module so we can use randomBytes when globalThis.crypto is unavailable instead of falling back to Math.random.
let nodeCrypto;
try {
  nodeCrypto = require("crypto");
} catch (_) {
  nodeCrypto = null;
}

/**
 * Generates a random hex token for CSRF protection.
 * @returns {string}
 */
function generateCsrfToken() {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(TOKEN_LENGTH);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // CHANGE 2: Use Node's crypto.randomBytes as the second secure option before giving up, covering Node < 19 environments.
  if (nodeCrypto && typeof nodeCrypto.randomBytes === "function") {
    const bytes = nodeCrypto.randomBytes(TOKEN_LENGTH);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // CHANGE 1: Remove the Math.random fallback entirely and throw instead — a predictable token is worse than a visible failure.
  throw new Error(
    "No cryptographically secure random source is available in this environment. " +
    "Token generation aborted to prevent weak CSRF tokens."
  );
}

module.exports = { generateCsrfToken };
```

## Explanation

### Issue 1: Math.random Produces Predictable Tokens

**Problem:** Any token generated through the `Math.random` branch is cryptographically weak. `Math.random` is a pseudo-random number generator seeded from a small, recoverable state. An attacker who captures a handful of tokens can reconstruct the internal state and predict every future token, making the CSRF protection useless.

**Fix:** The `Math.random` loop is deleted entirely and replaced with a `throw` statement at `CHANGE 1`. If no secure source is available, the function now raises an explicit error rather than silently emitting a weak token.

**Explanation:** `Math.random` is designed for non-security uses like shuffling UI elements. Its output space and seeding mechanism are not specified by the JS standard, but all mainstream engines use algorithms (V8 uses xorshift128+) whose state can be inferred from ~40 consecutive float outputs — far fewer than the number of tokens a real app emits. A silent fallback is particularly dangerous because it passes all functional tests (the token is still a hex string of the right length) while being entirely unsafe. Failing loudly forces operators to fix the deployment environment instead of running broken security silently. The one edge case to watch: if you catch this error upstream and allow the request to proceed without a token, you have removed CSRF protection entirely, so the error must propagate or abort the request.

---

### Issue 2: Node.js Built-in crypto Module Is Never Tried

**Problem:** In Node.js versions before 19, `globalThis.crypto` is not defined, so the secure `getRandomValues` branch is skipped. The code falls straight through to `Math.random`. Node has shipped a built-in `crypto` module with `randomBytes` since v0.5, so secure token generation was always possible — the code just never tried it.

**Fix:** At `CHANGE 2`, a `require("crypto")` call is added at module load time (wrapped in a try/catch for non-Node environments where the module does not exist). Inside `generateCsrfToken`, a second branch checks for `nodeCrypto.randomBytes` and uses it to fill a buffer of `TOKEN_LENGTH` bytes, converting the result to hex the same way the Web Crypto branch does.

**Explanation:** Node's `crypto.randomBytes` reads from the OS entropy source (`/dev/urandom` on Linux, `CryptGenRandom` on Windows), the same source that backs `getRandomValues` in browsers. Wrapping the `require` in a try/catch means the module still loads cleanly in browser bundles or environments (Deno, edge runtimes) where `require` is not defined. The order of checks matters: Web Crypto is tried first because it works in both modern Node and browsers; the `nodeCrypto` path is the explicit Node-specific fallback; and the `throw` is the last resort. A related pitfall is bundlers like webpack that stub `require("crypto")` to an empty object — the `typeof nodeCrypto.randomBytes === "function"` guard handles that case and falls through to the error.
