---
slug: queries-second-order-truncation-utf8
track: php
orderIndex: 63
title: UTF-8 Truncation Corrupts Stored Data
difficulty: medium
tags:
  - queries
  - encoding
  - data-integrity
  - mysql
language: php
---

## Context

This is `src/Repository/UserRepository.php`, which handles persistence for the `users` table in a multi-tenant SaaS application. The `email` column is declared as `VARCHAR(255) CHARACTER SET utf8` in MySQL. The application supports international email addresses and allows Unicode in display names.

Customer support tickets have been appearing where users report that their email address was "cut off" after updating their profile. Database inspection shows that some `email` values end abruptly mid-character, sometimes producing an invalid byte sequence that causes downstream mail delivery failures. The issue only affects addresses with characters outside the Basic Multilingual Plane (emoji, certain CJK extension characters).

The developer checked the PHP `mb_strlen()` of the email before inserting and confirmed it is within 255 characters. MySQL's `utf8` charset is the suspected culprit, but the code was not updated to account for it.

## Buggy code

```php
<?php
// src/Repository/UserRepository.php

class UserRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function updateEmail(int $userId, string $email): bool
    {
        if (mb_strlen($email) > 255) {
            throw new \InvalidArgumentException('Email too long');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email format');
        }

        $stmt = $this->pdo->prepare(
            "UPDATE users SET email = ? WHERE id = ?"
        );
        return $stmt->execute([$email, $userId]);
    }
}
```
