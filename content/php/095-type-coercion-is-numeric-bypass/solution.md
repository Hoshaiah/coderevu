## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — is_numeric Allows Hex Injection
// ------------------------------------------------------------------------

<?php
// src/Api/ReportController.php

class ReportController
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function getAccountSummary(array $params): array
    {
        $accountId = $params['account_id'] ?? '';

        // CHANGE 1: Replace is_numeric() with ctype_digit() so only plain decimal digit strings (e.g. "42") pass; hex strings like "0x1A" and floats like "1e5" are rejected.
        if (!ctype_digit((string)$accountId) || $accountId === '') {
            http_response_code(400);
            return ['error' => 'account_id must be numeric'];
        }

        // CHANGE 2: Use a prepared statement with a bound parameter instead of interpolating $accountId into the SQL string, eliminating any injection path at the query layer.
        $sql = "SELECT id, balance, owner_name FROM accounts WHERE id = ?";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([(int)$accountId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}
```

## Explanation

### Issue 1: `is_numeric()` Accepts Hex Strings

**Problem:** A caller sends `account_id=0x1A`. `is_numeric('0x1A')` returns `true` in PHP, so the validation check passes. The string `0x1A` goes straight into the SQL, and MySQL evaluates it as the integer `26`. An attacker can use this to probe other account IDs without knowing the decimal values, or combine it with arithmetic expressions MySQL will evaluate.

**Fix:** Replace `is_numeric()` with `ctype_digit((string)$accountId)`, as shown at CHANGE 1. `ctype_digit` returns `true` only when every character in the string is a decimal digit `0`–`9`, so `"0x1A"`, `"1e5"`, `"-1"`, and `"3.14"` all fail validation.

**Explanation:** `is_numeric()` documents that it accepts hexadecimal notation (`0x...`) in addition to decimal integers and floats with exponents. The PHP team added this for convenience in numeric comparisons, but it means the function's return value does not answer the question "is this a plain decimal integer?". `ctype_digit` answers exactly that question. Note that `ctype_digit` returns `false` on an empty string, so the `=== ''` guard in the original code can be dropped — the `ctype_digit` call already covers it. Also cast to `(string)` first because `ctype_digit` returns `false` for non-string types rather than coercing them.

---

### Issue 2: Raw SQL String Interpolation Instead of Prepared Statement

**Problem:** Even with a perfect validation function, interpolating user input into a SQL string is fragile — any future change to the validation logic, a type-juggling edge case, or a copy-paste of this pattern without the guard leaves the query wide open. The symptom is that the database receives a query string assembled from attacker-controlled text.

**Fix:** At CHANGE 2, replace `$this->pdo->query($sql)` with `$this->pdo->prepare($sql)` using a `?` placeholder, then call `$stmt->execute([(int)$accountId])`. The value is transmitted to the database driver as a bound parameter, never concatenated into the SQL text.

**Explanation:** Prepared statements separate the query structure from the data. The database parses the SQL template once and then receives the parameter value through a separate protocol channel, so there is no point at which the parameter value can change the query's meaning. Casting to `(int)` before binding adds a second layer: even if a non-integer string somehow reached this line, the cast produces `0` or a valid integer rather than a hex literal or expression. The prepared-statement fix is independent of Issue 1 — it would neutralize injection even if the validation were completely absent — but both layers should be present because defence-in-depth means a single mistake in one layer does not immediately create a vulnerability.
