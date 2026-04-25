## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — strcmp() Returns Zero on Array
// ------------------------------------------------------------------------

<?php
// api/v1/auth/verify_token.php

require_once __DIR__ . '/../../bootstrap.php';

$pdo = get_db_connection();

// CHANGE 1+2: Cast the header value to string explicitly so that if PHP ever surfaces it as an array (duplicate headers, framework quirks) it cannot produce a falsy strcmp() result of 0.
$header_token = (string)($_SERVER['HTTP_X_API_TOKEN'] ?? '');

$stmt = $pdo->prepare("SELECT token FROM api_tokens WHERE active = 1 LIMIT 1");
$stmt->execute();
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row) {
    http_response_code(401);
    echo json_encode(['error' => 'No active token found']);
    exit;
}

// CHANGE 1: Use hash_equals() instead of strcmp() so comparison is timing-safe and both operands are guaranteed strings; strcmp() returns 0 for array input, which === 0 passes the !== 0 guard and grants access.
if (!hash_equals((string)$row['token'], $header_token)) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid token']);
    exit;
}

// Token is valid — proceed
http_response_code(200);
echo json_encode(['status' => 'authorized']);
exit;
```

## Explanation

### Issue 1: `strcmp()` Accepts Arrays, Returns Zero

**Problem:** When an attacker (or a malformed client) sends the `X-Api-Token` header more than once in a single request, some PHP SAPI/nginx combinations expose `$_SERVER['HTTP_X_API_TOKEN']` as an array. `strcmp()` called with an array as either argument emits a PHP notice and returns `0`. Because `0 !== 0` is `false`, the `if` branch is skipped and the request is treated as authorized — every time, with no valid token at all. QA can reproduce this 100% of the time with a duplicate-header request.

**Fix:** Replace `strcmp($header_token, $row['token']) !== 0` with `!hash_equals((string)$row['token'], $header_token)`. `hash_equals()` requires both arguments to be strings and throws a type error rather than returning a misleading zero, so a non-string value can never slip past the check.

**Explanation:** In PHP 7, passing an array to `strcmp()` triggers `E_NOTICE` and returns `0` — the same value that signals "strings are equal". The `!== 0` guard on the result was meant to detect mismatches, but `0` from an array input looks identical to `0` from a matching string. `hash_equals()` enforces string types at the C level, so it will fatal-error rather than silently succeed on bad input. As a related pitfall, a direct `==` or `===` comparison against the strcmp result has the same vulnerability; the real fix is switching the comparison function entirely.

---

### Issue 2: Header Value Not Cast to String Before Use

**Problem:** Even before the comparison function is called, `$header_token` can hold an array if the SAPI collapses duplicate headers that way. Any subsequent string operation on it — logging, trimming, length checks — will also misbehave silently, making the root cause harder to trace in logs.

**Fix:** Add an explicit `(string)` cast at the assignment site: `$header_token = (string)($_SERVER['HTTP_X_API_TOKEN'] ?? '');`. This converts an array to the literal string `"Array"`, which will never equal a real token, so even if `hash_equals()` were not used the cast alone would prevent unauthorized access from this vector.

**Explanation:** PHP's weak typing means array-to-string coercion is allowed in many contexts but produces the unhelpful string `"Array"` rather than throwing. Casting early — at the point where untrusted data enters the script — makes the type contract explicit and ensures every downstream operation sees a proper string. It also means if a future developer replaces `hash_equals()` with another comparison, the input is already safe. The cast is the defensive boundary; `hash_equals()` is the correct comparison tool; together they eliminate the entire class of type-confusion bypass.
