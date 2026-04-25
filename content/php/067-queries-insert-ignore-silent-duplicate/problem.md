---
slug: queries-insert-ignore-silent-duplicate
track: php
orderIndex: 67
title: INSERT IGNORE Swallows Integrity Errors
difficulty: medium
tags:
  - queries
  - correctness
  - error-handling
language: php
---

## Context

This file is `jobs/RegisterReferral.php`, a background job that is enqueued whenever a new user completes registration via a referral link. It records the referral relationship in a `referrals` table that has a unique constraint on `(referee_id)` to prevent a user from being credited twice.

The product team noticed that referral bonuses were sometimes not being paid out even though the job completed without errors. Checking the `referrals` table showed missing rows for affected users, yet the job logs showed `Referral recorded for user 42` — a success message. No exception, no error code, nothing in the dead-letter queue.

The bug only appeared when a retry storm hit: the job queue occasionally re-enqueues jobs on worker restart, so the same referral job can run twice within seconds. Engineers assumed the unique constraint would prevent double-inserts and that the code handled it correctly, but they never verified what the code actually did when the insert was blocked.

## Buggy code

```php
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
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO referrals (referrer_id, referee_id, created_at)
             VALUES (?, ?, NOW())'
        );
        $stmt->execute([$referrerId, $refereeId]);

        if ($stmt->rowCount() >= 0) {
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
