## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Timing-Unsafe API Token Compare
// ------------------------------------------------------------------------

<?php
// src/Middleware/ApiTokenMiddleware.php

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;

class ApiTokenMiddleware implements MiddlewareInterface
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function process(
        ServerRequestInterface $request,
        RequestHandlerInterface $handler
    ): ResponseInterface {
        $token = $request->getHeaderLine('X-Api-Token');
        $source = $request->getHeaderLine('X-Source');

        // CHANGE 2: Reject requests that are missing the X-Source or X-Api-Token headers early, before touching the database, so an attacker cannot probe credential rows with empty or arbitrary source values.
        if ($source === '' || $token === '') {
            return new Response(401, [], 'Unauthorized');
        }

        $stmt = $this->pdo->prepare(
            "SELECT token FROM api_credentials WHERE source = ?"
        );
        $stmt->execute([$source]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        // CHANGE 1: Replace `!== ` strict equality with `hash_equals()`, which compares both strings in constant time regardless of where they first differ, eliminating the timing oracle.
        if (!$row || !hash_equals($row['token'], $token)) {
            return new Response(401, [], 'Unauthorized');
        }

        return $handler->handle($request);
    }
}
```

## Explanation

### Issue 1: Timing-unsafe token comparison

**Problem:** The middleware uses `$token !== $row['token']` to authenticate requests. PHP's string `!==` operator short-circuits the moment it finds the first differing byte, so a request whose token matches the first byte takes measurably longer than one that mismatches immediately. An attacker sending thousands of requests can statistically identify each correct byte in sequence and reconstruct the full token without ever having seen it.

**Fix:** Replace `$token !== $row['token']` with `!hash_equals($row['token'], $token)`. `hash_equals()` always compares every byte of both strings before returning, so its execution time depends only on the length of the known-good value, not on how many bytes the attacker guessed correctly.

**Explanation:** PHP's `===` / `!==` on strings is implemented as a byte-by-byte loop that returns `false` the instant two bytes differ. A 32-character token whose first byte is wrong finishes in roughly one iteration; a token with 31 correct bytes takes 31 iterations. Over a network, this difference is small but measurable, especially when averaged over many samples to reduce jitter. `hash_equals()` was added to PHP specifically to close this gap: it uses a constant-time XOR accumulator internally and always walks the full length of the reference string. Note that `hash_equals()` still returns `false` immediately if the two strings differ in length, but that leaks only length information — something an attacker can observe from the API spec anyway and cannot exploit to enumerate the token's bytes.

---

### Issue 2: Missing header validation enables unconstrained source probing

**Problem:** If a caller omits the `X-Source` header, `getHeaderLine()` returns an empty string `''`, which is then passed directly to the SQL query. Depending on the database contents, this may match a row (if a blank source was ever inserted) or return no row — but either way the attacker learns they can send arbitrary source values and probe the credential table. A caller can also supply any source string they like to target a specific tenant's token.

**Fix:** Add an early guard before the database call that returns a `401` immediately when either `$source` or `$token` is an empty string (the `// CHANGE 2` block). This prevents the query from running at all when required headers are absent.

**Explanation:** `ServerRequestInterface::getHeaderLine()` is specified to return an empty string when the header is missing, not `null`, so a missing `X-Source` silently becomes `WHERE source = ''`. Without the early check, every request — even one with no headers at all — reaches the database. The fix adds an explicit gate so that only requests carrying both required headers proceed to the credential lookup. This does not prevent a determined attacker from supplying a valid-looking source they do not own, but it eliminates the degenerate case of empty-string queries and makes the preconditions for authentication explicit and auditable.
