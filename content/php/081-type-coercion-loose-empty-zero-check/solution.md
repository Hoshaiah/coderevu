## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — empty() Treats Zero as Missing
// ------------------------------------------------------------------------

<?php
// src/Inventory/StockUpdater.php

class StockUpdater
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function updateStock(int $productId, mixed $quantity): bool
    {
        // CHANGE 1: Replace empty() with an explicit null check so that 0 is accepted as a valid quantity; empty(0) returns true and would incorrectly reject zero-stock updates.
        if ($quantity === null) {
            // CHANGE 2: Update the log message to say 'null quantity' instead of 'missing quantity' so it accurately reflects what the check tests, preventing confusion with the legitimate value 0.
            error_log("updateStock called with null quantity for product $productId");
            return false;
        }

        if (!is_numeric($quantity) || $quantity < 0) {
            error_log("updateStock called with invalid quantity '$quantity' for product $productId");
            return false;
        }

        $stmt = $this->db->prepare(
            'UPDATE products SET stock_quantity = ?, updated_at = NOW() WHERE id = ?'
        );
        $stmt->execute([(int) $quantity, $productId]);

        return $stmt->rowCount() === 1;
    }
}
```

## Explanation

### Issue 1: `empty()` Rejects Valid Zero Quantity

**Problem:** When a warehouse reconciliation sets an item's stock to 0, the webhook payload delivers `quantity = 0`. The guard `if (empty($quantity))` evaluates `empty(0)` as `true`, so the function logs an error and returns `false` without touching the database. The old stock level stays unchanged while the caller receives `false` — and since the HTTP endpoint returns 200 regardless, the external system never learns the update was dropped.

**Fix:** Replace `empty($quantity)` with `$quantity === null` at the CHANGE 1 site. This checks only for the absence of a value, not for zero-ness.

**Explanation:** PHP's `empty()` returns `true` for any value that is falsy: `null`, `""`, `"0"`, `0`, `0.0`, `[]`, and `false`. That makes it useful for form-field presence checks where all those values mean "user left the field blank", but here 0 is a meaningful domain value meaning "out of stock". Using `=== null` tests only what the function actually wants to guard against: a caller that passed no quantity at all. Note that the function signature declares `mixed $quantity`, so `null` is a real possibility; the downstream `is_numeric` check already rejects strings and non-numeric input, so the only case the null guard needs to handle is a genuinely absent argument.

---

### Issue 2: Misleading Log Message for Zero Quantity

**Problem:** The original log says `"updateStock called with missing quantity"`. After fixing Issue 1, this branch only fires when `$quantity` is literally `null`. Keeping the word "missing" is confusing because a developer reading logs might think the webhook omitted the field entirely, when the real condition is a null PHP value.

**Fix:** At the CHANGE 2 site, change the log string from `"missing quantity"` to `"null quantity"` so it accurately describes the condition that triggered the branch.

**Explanation:** Log messages are the primary debugging tool for silent failures in webhook pipelines. If the message says "missing" but the code tests for `null`, a developer investigating an incident has to read the source to understand what "missing" actually means. Saying `"null quantity"` maps directly to the code condition `$quantity === null`, making it faster to correlate a log line with the specific branch that produced it. This is a small change but it matters when the system returns HTTP 200 for all outcomes and logs are the only signal that something went wrong.
