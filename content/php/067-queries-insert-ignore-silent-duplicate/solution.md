## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — INSERT IGNORE Swallows Integrity Errors
// ------------------------------------------------------------------------

<?php
// jobs/RegisterReferral.php

class RegisterReferralJob
{
    private PDO $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function handle(int $referrerId, int $refereeId): void
    {
        // CHANGE 2: Replace INSERT IGNORE with a plain INSERT so a duplicate-key violation throws a PDOException instead of being silently swallowed.
        $stmt = $this->db->prepare(
            'INSERT INTO referrals (referrer_id, referee_id, created_at)
             VALUES (?, ?, NOW())'
        );

        try {
            $stmt->execute([$referrerId, $refereeId]);
        } catch (\PDOException $e) {
            // Integrity constraint violation (SQLSTATE 23000) means the row already exists; treat as a no-op.
            if (strpos($e->getCode(), '23') === 0) {
                error_log("Referral already recorded for user {$refereeId}, skipping.");
                return;
            }
            throw $e;
        }

        // CHANGE 1: Check rowCount() === 1 (exactly one row inserted) instead of >= 0, so the bonus is only credited when the INSERT actually wrote a new row.
        if ($stmt->rowCount() === 1) {
            $this->creditReferrer($referrerId);
            error_log("Referral recorded for user {$refereeId}");
        }
    }

    private function creditReferrer(int $referrerId): void
    {
        // Awards bonus points to the referrer
        $stmt = $this->db->prepare(
            'UPDATE users SET bonus_points = bonus_points + 100 WHERE id = ?'
        );
        $stmt->execute([$referrerId]);
    }
}
```

## Explanation

### Issue 1: `rowCount() >= 0` Always True

**Problem:** When `INSERT IGNORE` blocks a duplicate insert, it inserts zero rows and `rowCount()` returns `0`. The condition `$stmt->rowCount() >= 0` evaluates to `true` because `0 >= 0` is true. Every retry therefore calls `creditReferrer()` and logs a success message, even though nothing was written to the database.

**Fix:** Replace `>= 0` with `=== 1` at the `CHANGE 1` site so the bonus is only awarded when exactly one row was inserted.

**Explanation:** `PDOStatement::rowCount()` returns the number of rows affected by the last DML statement. For a blocked `INSERT IGNORE`, that count is `0`, not a negative sentinel. Any non-negative comparison (`>= 0`, `> -1`) will pass unconditionally. Using strict equality `=== 1` correctly distinguishes a successful first insert from a suppressed duplicate. A related pitfall: `rowCount()` behavior on SELECT statements is driver-dependent, so always use it only after INSERT/UPDATE/DELETE.

---

### Issue 2: `INSERT IGNORE` Hides Duplicate-Key Errors

**Problem:** `INSERT IGNORE` tells MySQL to discard any error that would normally abort the statement, including duplicate-key violations. The calling code has no way to tell whether the row was inserted or skipped — both paths return normally, `rowCount()` is the only signal, and (per Issue 1) that signal was misread. The result is silent double-crediting on retries.

**Fix:** At the `CHANGE 2` site, replace `INSERT IGNORE` with a plain `INSERT` and wrap `execute()` in a `try/catch`. Catch `PDOException` values whose SQLSTATE starts with `23` (integrity constraint violation) and return early; rethrow anything else.

**Explanation:** A plain `INSERT` raises a `PDOException` with SQLSTATE `23000` (or a subclass like `23505` in PostgreSQL) when the unique constraint is violated. This gives the job explicit, inspectable signal that the row already exists. The `try/catch` block converts that known-safe error into a logged no-op while letting unexpected errors propagate normally to the job queue's dead-letter mechanism. This approach also works correctly even if `rowCount()` were checked — catching the exception and returning early means `creditReferrer()` is never reached for duplicates. One pitfall: if PDO's `ERRMODE` is set to `PDO::ERRMODE_SILENT`, exceptions are not thrown; always confirm `ERRMODE_EXCEPTION` is set when relying on this pattern.
