## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Switch Matches Zero Status
// ------------------------------------------------------------------------

<?php
// api/webhooks/payment_callback.php

require_once __DIR__ . '/../../bootstrap.php';

$body = json_decode(file_get_contents('php://input'), true);

$order_id      = (int) ($body['order_id'] ?? 0);
$payment_status = $body['payment_status'] ?? '';

function map_status(string $payment_status): int
{
    // CHANGE 1: Replace loose switch with strict match expression so string inputs are never coerced to int during comparison.
    // CHANGE 2: Remove the misleading `case 0` branch; the default arm handles unknown statuses cleanly.
    return match($payment_status) {
        'success' => 1,
        'failed'  => 2,
        'pending' => 3,
        default   => 0,
    };
}

$internal_status = map_status($payment_status);

if ($internal_status === 0) {
    http_response_code(400);
    echo json_encode(['error' => 'Unknown payment status']);
    exit;
}

$pdo  = get_db_connection();
$stmt = $pdo->prepare("UPDATE orders SET status = ?, updated_at = NOW() WHERE id = ?");
$stmt->execute([$internal_status, $order_id]);

http_response_code(200);
echo json_encode(['ok' => true]);
exit;
```

## Explanation

### Issue 1: Loose Switch Type Juggling Misroutes Strings

**Problem:** When the gateway sends `"failed"`, the switch evaluates `"failed" == 0` first (the `case 0` arm). PHP's loose comparison converts a non-numeric string to `0` when compared against an integer, so that comparison is `true`. The function returns `3` (pending) instead of `2` (failed). For `"success"`, the string `"success"` also coerces to `0`, so it too hits `case 0` and returns `3`. The only reason finance saw status `1` (success) being written is that another code path or a race condition overwrote it — but the root cause is this type juggling.

**Fix:** Replace the `switch` statement with a `match` expression (`match($payment_status)`) at the CHANGE 1 site. `match` uses strict (`===`) comparison, so no type coercion occurs and each string arm only fires on an exact string match.

**Explanation:** PHP's `switch` uses loose `==` for every case comparison. When you write `case 0:` and the subject is a string, PHP applies the same rules as `(string) == (int)`: a non-numeric string casts to `0`, making every non-numeric string match `case 0`. So `"failed" == 0` is `true` and the `case 'failed'` arm is never reached. `match` was introduced in PHP 8.0 specifically to avoid this: it always uses `===`, comparing type and value. Switching to `match` means `"failed" === 0` is `false`, `"failed" === 'failed'` is `true`, and the correct integer `2` is returned.

---

### Issue 2: Dead `case 0` Arm Masks Real Logic

**Problem:** The `case 0:` branch was commented as "unreachable intentional default", but it is reachable for every non-numeric string input, and it returns `3` (pending) for statuses that should map elsewhere. It obscures the real default behaviour and actively interferes with correct routing.

**Fix:** Remove the `case 0` branch entirely at the CHANGE 2 site. The `default => 0` arm in the `match` expression now handles any unrecognised status and triggers the 400 response guard below.

**Explanation:** The developer likely intended `case 0` as a guard against a numeric zero being passed, but because PHP's `switch` is loose, it swallows all non-numeric strings. Removing it and relying on `match`'s `default` arm is both correct and cleaner: unknown statuses return `0`, the caller checks for `=== 0`, and the 400 error path fires as intended. A related pitfall to keep in mind: if you ever need to switch on mixed-type data in PHP, prefer `match` or add an explicit `(string)` cast before the `switch` to prevent silent coercion.
