---
slug: queries-missing-unique-constraint-race
track: php
orderIndex: 73
title: Duplicate Insert Without Unique Guard
difficulty: hard
tags:
  - queries
  - correctness
  - concurrency
language: php
---

## Context

The function below lives in `src/Service/ReferralService.php` and is called when a new user completes registration. It creates a referral credit for the user who invited them. The `referral_credits` table has columns `id`, `referrer_id`, `referred_id`, and `amount`. Business rules state each referrer should receive credit exactly once per referred user.

The support team reports that some referrers have been credited multiple times for the same referred user — in some cases the same pair appears three or four times in the table. The data team confirmed the `referral_credits` table has no unique constraint on `(referrer_id, referred_id)`.

The registration flow is async: the app fires a post-registration event and two workers sometimes pick it up simultaneously during a spike. The developer argued the `SELECT` check before the `INSERT` should prevent duplicates.

## Buggy code

```php
<?php
// src/Service/ReferralService.php

class ReferralService
{
    public function __construct(private PDO $pdo) {}

    public function awardReferralCredit(int $referrerId, int $referredId): void
    {
        // Check if credit already exists to avoid duplicates
        $check = $this->pdo->prepare(
            'SELECT COUNT(*) FROM referral_credits
             WHERE referrer_id = ? AND referred_id = ?'
        );
        $check->execute([$referrerId, $referredId]);
        $exists = (int) $check->fetchColumn();

        if ($exists > 0) {
            return; // Already credited
        }

        $insert = $this->pdo->prepare(
            'INSERT INTO referral_credits (referrer_id, referred_id, amount)
             VALUES (?, ?, 10.00)'
        );
        $insert->execute([$referrerId, $referredId]);
    }
}
```
