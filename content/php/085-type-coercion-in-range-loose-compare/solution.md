## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Comparison in Range Check
// ------------------------------------------------------------------------

<?php
// src/Billing/DiscountValidator.php

class DiscountValidator
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function validate(string $code): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT code, discount_percent, expires_at FROM discount_codes WHERE code = ?"
        );
        $stmt->execute([$code]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row) {
            return ['valid' => false, 'reason' => 'Code not found'];
        }

        // CHANGE 1: Cast to int immediately so all comparisons are strict numeric checks, not loose string-to-number coercions that accept '0', '', or 'false' as >= 1.
        $pct = (int) $row['discount_percent'];

        if ($pct >= 1 && $pct <= 100) {
            // CHANGE 2: Return the already-cast int $pct so downstream arithmetic always receives a proper integer, not a raw PDO string.
            return ['valid' => true, 'percent' => $pct];
        }

        return ['valid' => false, 'reason' => 'Percent out of range'];
    }
}
```

## Explanation

### Issue 1: Loose Comparison Accepts Invalid String Values

**Problem:** PHP's `>=` and `<=` operators apply type-juggling rules when one operand is a string. Non-numeric strings like `"false"` or `""` coerce to `0`, and comparing `0 >= 1` is `false` — but a string like `"0"` also coerces to `0`, so it too fails the check. The real danger is subtler strings: any non-numeric string compared to an integer in PHP 7 uses string-vs-integer rules that can produce unexpected `true` results, and in PHP 8 numeric strings still get coerced silently. Accounting saw `"false"` and `"0"` slipping through because the developer assumed PDO returned a number.

**Fix:** Replace `$pct = $row['discount_percent']` with `$pct = (int) $row['discount_percent']` at the `CHANGE 1` site. The explicit `(int)` cast converts the PDO string to an integer before any comparison runs.

**Explanation:** PDO's default `FETCH_ASSOC` mode returns every column as a PHP string regardless of the MySQL column type. When you write `$pct >= 1` where `$pct` is the string `"false"`, PHP converts `"false"` to `0` for the comparison, giving `0 >= 1` which is `false` — so that case is blocked. But with the string `" 5"` (leading space) or locale-specific decimal formats, the coercion may or may not produce the integer you expect, making the gate unreliable. Casting with `(int)` first means `"false"` becomes `0`, `"0"` becomes `0`, `" 10"` becomes `10`, and all comparisons then run as straightforward integer arithmetic with no implicit coercion surprises. A related pitfall: if the column is `DECIMAL` in MySQL and PDO returns `"99.9"`, `(int)` truncates to `99`, which is still in range; use `(float)` if fractional percentages are ever valid.

---

### Issue 2: Raw String Returned as Percent Value

**Problem:** Even when the range check passes, `$pct` is still the original string from PDO (e.g., `"10"`). The caller receives `['valid' => true, 'percent' => "10"]` and likely does arithmetic like `$price * (1 - $row['percent'] / 100)`. PHP will silently coerce the string in most arithmetic contexts, but typed codebases, JSON serialization, or strict-mode functions may treat it as a string, producing `"10" / 100` giving `0.1` — which actually works in PHP — but `json_encode` emits `"percent":"10"` (a JSON string) instead of `"percent":10` (a JSON number), breaking any API consumer that distinguishes types.

**Fix:** At the `CHANGE 2` site, the `return` statement uses `$pct` which is already `(int)` after the `CHANGE 1` cast, so the array now contains an integer under the `percent` key rather than a raw PDO string.

**Explanation:** Because `CHANGE 1` introduces the cast at the point of assignment, `$pct` holds an `int` for the rest of the method. No additional change is needed in the `return` statement itself — the fix is inherited — but the comment at `CHANGE 2` documents the intent explicitly so future reviewers do not "optimize" away the cast thinking it is redundant. The concrete risk without the cast: `json_encode(['percent' => '10'])` produces `{"percent":"10"}`, but `json_encode(['percent' => 10])` produces `{"percent":10}`. A JavaScript or Python client checking `typeof discount.percent === 'number'` would fail on the string form, or a database INSERT expecting an integer column would require an extra conversion step downstream.
