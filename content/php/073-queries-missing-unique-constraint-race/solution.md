## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Duplicate Insert Without Unique Guard
// ------------------------------------------------------------------------

<?php
// src/Service/ReferralService.php

class ReferralService
{
    public function __construct(private PDO $pdo) {}

    public function awardReferralCredit(int $referrerId, int $referredId): void
    {
        // CHANGE 2: Add a unique index on (referrer_id, referred_id) at the DB level so the INSERT itself enforces uniqueness regardless of application logic. Run this migration once: ALTER TABLE referral_credits ADD UNIQUE INDEX uq_referrer_referred (referrer_id, referred_id);

        // CHANGE 1: Replace the SELECT-then-INSERT pattern with INSERT IGNORE so the write is a single atomic operation; concurrent workers both attempt the INSERT and the database lets exactly one succeed, eliminating the TOCTOU window.
        $insert = $this->pdo->prepare(
            'INSERT IGNORE INTO referral_credits (referrer_id, referred_id, amount)
             VALUES (?, ?, 10.00)'
        );
        $insert->execute([$referrerId, $referredId]);
    }
}
```

## Explanation

### Issue 1: TOCTOU Race in SELECT-then-INSERT

**Problem:** Two workers processing the same event simultaneously both execute the `SELECT COUNT(*)` check and both see zero rows. Both then proceed to the `INSERT`, and both succeed, creating duplicate credit rows. Support sees the same `(referrer_id, referred_id)` pair appearing two, three, or four times in `referral_credits`.

**Fix:** Remove the `SELECT` check entirely and replace `INSERT INTO` with `INSERT IGNORE INTO`. The fix is at the `CHANGE 1` site — the `prepare` call now uses `INSERT IGNORE` and the `$check` query and its `if ($exists > 0) return;` guard are deleted.

**Explanation:** The SELECT and INSERT are two separate database round-trips with no lock held between them. Any number of concurrent callers can read the same "not exists" result before any of them writes. `INSERT IGNORE` collapses the check and write into a single atomic statement: the database evaluates the unique constraint and discards the duplicate row if one already exists. The first writer wins; every subsequent concurrent writer gets a silent no-op rather than a new row. This works correctly even under high concurrency without any application-level locking.

---

### Issue 2: Missing Unique Constraint on (referrer_id, referred_id)

**Problem:** The `referral_credits` table has no unique index on `(referrer_id, referred_id)`, so the database has no way to reject a duplicate row. Any bug in application logic — or a direct SQL call that bypasses the service — silently inserts extra credits with no error.

**Fix:** The `CHANGE 2` comment documents the required one-time migration: `ALTER TABLE referral_credits ADD UNIQUE INDEX uq_referrer_referred (referrer_id, referred_id);`. This is what makes `INSERT IGNORE` (from Issue 1) actually enforce uniqueness; without the index, `IGNORE` has no constraint to honour and duplicates still slip through.

**Explanation:** `INSERT IGNORE` suppresses the error that a unique constraint violation would raise — but it needs a constraint to violate in the first place. Without the index, the database treats every row as distinct and inserts them all. The unique index is also the correct long-term backstop: even if a future developer reintroduces a SELECT-then-INSERT pattern, or a script runs a direct INSERT, the database enforces the business rule that each `(referrer_id, referred_id)` pair appears at most once. Adding the constraint after the fact requires a deduplication step on any existing duplicate rows before the `ALTER TABLE` will succeed.
