## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Comparison on API Token
// ------------------------------------------------------------------------

<?php
// api/webhook.php

$pdo = new PDO('mysql:host=localhost;dbname=shop', 'app', 'secret');

$stmt = $pdo->query("SELECT value FROM settings WHERE name = 'webhook_secret' LIMIT 1");
$expected = $stmt->fetchColumn(); // returns a string like "abc123xyz"

$incoming = $_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? null;

// CHANGE 3: Reject immediately when no token header is present, so a null $incoming never reaches the comparison.
if (!is_string($incoming) || $incoming === '') {
    http_response_code(403);
    echo json_encode(['error' => 'forbidden']);
    exit;
}

// CHANGE 1 + CHANGE 2: Replace loose == with hash_equals(), which requires both args to be strings and performs a constant-time comparison, eliminating both the type-juggling bypass and the timing side-channel.
if (is_string($expected) && hash_equals($expected, $incoming)) {
    $payload = json_decode(file_get_contents('php://input'), true);
    // process order update
    $orderId = (int) $payload['order_id'];
    $pdo->prepare("UPDATE orders SET status = ? WHERE id = ?")
        ->execute([$payload['status'], $orderId]);
    http_response_code(200);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(403);
echo json_encode(['error' => 'forbidden']);
```

## Explanation

### Issue 1: Loose Comparison Type-Juggling Bypass

**Problem:** The `==` operator applies PHP's type coercion rules before comparing. If `$expected` comes back as `false` from `fetchColumn()` (e.g. the row is missing) and `$incoming` is `null` (header absent), the expression `null == false` evaluates to `true`, and the webhook handler runs as if the token was valid. Operators see requests with no token being accepted.

**Fix:** Replace `$incoming == $expected` with `hash_equals($expected, $incoming)` guarded by an `is_string($expected)` check. `hash_equals` requires both arguments to be strings and performs a strict byte-for-byte comparison without coercion.

**Explanation:** PHP's loose comparison promotes operands to a common type before comparing. `null`, `false`, `0`, and `""` all compare equal to each other under `==`. A database miss on the secret row returns `false` from `fetchColumn()`, and a missing HTTP header produces `null` via the null-coalescing default. Both are falsy, so `==` treats them as equal. `hash_equals` does not do type promotion; it returns `false` for any non-string argument (PHP emits a warning and returns `false` since PHP 8, and prior to that it coerces but the `is_string` guard prevents that path entirely). The guard on `$expected` also protects against a misconfigured database returning an unexpected type.

---

### Issue 2: Non-Constant-Time String Comparison

**Problem:** Even with a correct type check, a plain `===` or `==` comparison returns as soon as it finds the first differing byte. An attacker who can send many requests can measure response-time variance to determine, one byte at a time, what the correct token is. This is a real threat for webhooks reachable over the public internet.

**Fix:** Use `hash_equals($expected, $incoming)` in place of any equality operator. `hash_equals` always iterates all bytes of both strings before returning, so the comparison time is constant regardless of where the strings first differ.

**Explanation:** Modern timing attacks against web endpoints are practical when the attacker can average latency over thousands of samples to cancel network jitter. PHP's built-in string operators short-circuit at the first byte mismatch, leaking information about how many leading bytes the guess shares with the real secret. `hash_equals` was added to PHP specifically to prevent this: it XORs every byte pair and accumulates the result, then checks if the accumulator is zero, so every call takes the same number of operations for a given string length. A related pitfall: always pass the known-good expected value as the first argument to `hash_equals`, because its documentation specifies that argument order matters for the length-leaking property in some implementations.

---

### Issue 3: No Early Guard for Missing Header

**Problem:** When a request arrives without the `X-Webhook-Token` header, `$_SERVER['HTTP_X_WEBHOOK_TOKEN']` is not set, and the null-coalescing operator assigns `null` to `$incoming`. Code below this point then compares `null` against whatever the database returned, rather than immediately rejecting the request. Without an explicit guard, the behavior of the comparison depends entirely on what value the database happens to return.

**Fix:** Add an `is_string($incoming) || $incoming === ''` check immediately after reading `$incoming`, and return a 403 before touching the database secret if the header is absent or not a string.

**Explanation:** Failing early on a clearly invalid input is a defense-in-depth practice: it reduces the number of code paths that must correctly handle `null`, and it makes the intent explicit. Without this guard, the security of the endpoint depends on the downstream comparison correctly handling `null` — which the buggy code did not. Adding this check also means that even if `hash_equals` or the `is_string($expected)` guard were later removed by another developer, the endpoint would still reject tokenless requests rather than silently pass them through.
