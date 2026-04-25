## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — intval Misparses Octal User Input
// ------------------------------------------------------------------------

<?php
// api/UpdateInventory.php

function updateStockCount(PDO $pdo, int $productId, string $rawCount): bool
{
    // Scanner firmware sends zero-padded 8-digit strings; convert to int
    // CHANGE 1: Use base 10 explicitly instead of base 0; base 0 triggers octal parsing for strings with a leading zero, so '00000056' would become 46 instead of 56.
    $count = intval($rawCount, 10);

    if ($count < 0) {
        throw new InvalidArgumentException("Stock count cannot be negative.");
    }

    // CHANGE 2: Reject unreasonably large counts that no real warehouse stock level would reach, preventing garbage values from reaching the database.
    if ($count > 99999999) {
        throw new InvalidArgumentException("Stock count exceeds maximum allowed value.");
    }

    $stmt = $pdo->prepare('UPDATE products SET stock = ? WHERE id = ?');
    return $stmt->execute([$count, $productId]);
}
```

## Explanation

### Issue 1: `intval` Base-0 Triggers Octal Parsing

**Problem:** Any zero-padded count string that contains only the digits 0–7 is silently converted as an octal literal. A worker entering `56` units triggers the scanner to send `00000056`, which `intval($rawCount, 0)` reads as octal 56 (decimal 46). The database is updated to 46 instead of 56, and the team sees stock levels that are consistently wrong for a subset of counts.

**Fix:** Replace `intval($rawCount, 0)` with `intval($rawCount, 10)` at the CHANGE 1 site. Passing an explicit base of `10` forces decimal interpretation regardless of leading zeros.

**Explanation:** PHP's `intval` with base `0` mimics C's `strtol` auto-detection: a `0x` prefix means hex, a leading `0` with no `x` means octal, and anything else means decimal. The zero-padding the scanner firmware adds is enough to activate octal mode. The bug only shows up for strings whose digits are all in the 0–7 range because `intval('00000099', 0)` hits a non-octal digit and PHP falls back to decimal — which is why counts containing `8` or `9` appeared correct in production and were never caught. Fixing the base to `10` makes the behaviour unconditional and immune to whatever prefix characters the input carries.

---

### Issue 2: No Upper-Bound Validation on Stock Count

**Problem:** The function rejects negative values but accepts any non-negative integer, including values like `99999999` or higher that are nonsensical stock levels and may overflow the target database column type (commonly `INT` or `MEDIUMINT`). A firmware glitch or malformed request could silently write a wildly large number.

**Fix:** Add an upper-bound check at the CHANGE 2 site: if `$count > 99999999`, throw an `InvalidArgumentException` before the query runs. The threshold matches the maximum value an 8-digit zero-padded field can legitimately represent.

**Explanation:** The scanner firmware is documented to send exactly eight digits, so the highest legitimate value is `99999999`. Without an upper bound, any input that parses to a larger integer (due to firmware bugs, proxy tampering, or manual API calls) reaches the database unchecked. Depending on the column type, this either truncates silently or raises a database error with no meaningful message to the caller. Throwing an `InvalidArgumentException` before execution gives the API a clear, predictable contract and makes integration errors visible immediately rather than at the database layer.
