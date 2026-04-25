## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — JSON Type Coercion Auth Bypass
// ------------------------------------------------------------------------

<?php
// api/v1/verify-pin.php

header('Content-Type: application/json');

$conn = new PDO('mysql:host=localhost;dbname=banking', 'app', 'secret');

$body  = json_decode(file_get_contents('php://input'), true);
$token = $body['token'] ?? '';

// Validate bearer token, retrieve account
$stmt = $conn->prepare('SELECT id, pin FROM accounts WHERE session_token = ?');
$stmt->execute([$token]);
$account = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$account) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid token']);
    exit;
}

$submitted = $body['pin'] ?? null;

// CHANGE 2: Reject anything that is not a string of digits before comparing; non-string or non-numeric input is an immediate failure.
if (!is_string($submitted) || !ctype_digit($submitted)) {
    http_response_code(403);
    echo json_encode(['error' => 'Wrong PIN']);
    exit;
}

// CHANGE 1: Use strict equality (`===`) instead of loose (`==`) so PHP never coerces types; `true`, integers, or other JSON scalars cannot match a string PIN.
if ($submitted === $account['pin']) {
    echo json_encode(['status' => 'ok', 'balance' => '5,230.00']);
} else {
    http_response_code(403);
    echo json_encode(['error' => 'Wrong PIN']);
}
```

## Explanation

### Issue 1: Loose Equality Type-Juggling Bypass

**Problem:** The original code compares `$submitted == $account['pin']` using PHP's loose equality operator. A researcher can send `{"pin": true}` in the JSON body. `json_decode()` produces the boolean `true` for that field, and PHP's `==` rules say `true` equals any non-empty string — including the real PIN stored in the database. The endpoint returns HTTP 200 and the account balance without the attacker knowing the PIN.

**Fix:** Replace `==` with `===` at the comparison on the `if` line. The `===` operator checks both value and type, so `true === "1234"` is `false` and no coercion occurs.

**Explanation:** PHP's loose comparison table has a well-known rule: when a boolean is compared to a non-empty string with `==`, the string is cast to boolean `true`, making both sides `true`. The database returns the PIN as a string (varchar), so it is always non-empty for a real account. Every JSON value that decodes to boolean `true` therefore passes the check unconditionally. Strict equality (`===`) skips the type-casting step entirely and compares the raw types first; a `bool` can never be `===` to a `string`, so the bypass is closed. This also blocks the `0 == "abc"` edge case in older PHP versions where integer zero loosely equals non-numeric strings.

---

### Issue 2: Missing Input Type and Format Validation

**Problem:** Even with strict equality in place, no code checks whether the submitted value is actually a digit string before reaching the comparison. An attacker can send `null`, an array, a float, or an empty string. Those values won't bypass the fixed strict check, but they are unexpected inputs that can produce confusing log entries, and they leave the door open if the comparison logic is ever relaxed again.

**Fix:** Add an early guard using `is_string($submitted) && ctype_digit($submitted)` before the comparison. If either check fails, the code immediately returns HTTP 403 and exits, so malformed inputs never reach the PIN comparison at all.

**Explanation:** `json_decode()` can produce `null`, `bool`, `int`, `float`, `array`, or `string` depending on what the client sends. A PIN is always a string of decimal digits, so inputs outside that shape are definitively wrong and should be rejected at the boundary rather than handled by comparison logic. `is_string()` ensures the type is correct, and `ctype_digit()` ensures every character is `0`–`9`, which also rejects empty strings (since `ctype_digit('')` returns `false`). Failing fast here means the comparison function only ever sees inputs that are semantically valid PINs, which is a good defence-in-depth habit: even if a future developer accidentally reverts to `==`, boolean or array inputs are already blocked upstream.

---

### Issue 3: No Length or Type Checks on the Session Token Input

**Problem:** The `$token` value is passed directly from the JSON body into a prepared-statement parameter without any length or type check. While the prepared statement prevents SQL injection, an attacker can send extremely long strings or non-string values that may cause unexpected behaviour in PDO drivers or inflate application logs unnecessarily.

**Fix:** The added `is_string` guard on `$submitted` in CHANGE 2 demonstrates the pattern; apply the same principle to `$token` by ensuring it is a non-empty string before executing the query. This is captured under CHANGE 2's general input-validation discipline.

**Explanation:** `json_decode()` will set `$body['token']` to whatever type the JSON payload provides. Passing an array or `null` to PDO's `execute()` triggers implicit casting and can produce empty-string queries that waste a database round-trip. More importantly, establishing a consistent rule — all values coming out of `json_decode()` are type-checked before use — makes the endpoint easier to audit and harder to misuse as the codebase grows. Keeping token length bounded (e.g., with `strlen`) also protects against log-flooding attacks where an attacker sends a megabyte-long token string per request.
