---
slug: string-format-null-argument-npe
track: java
orderIndex: 68
title: String.format Null Argument NPE
difficulty: easy
tags:
  - nulls
  - exceptions
  - correctness
language: java
---

## Context

This class is in `src/main/java/com/example/notifications/EmailFormatter.java`. It formats outgoing email subject lines from user account data. The `userId` field in `UserAccount` can be `null` for guest accounts that have not yet been assigned a permanent ID. The formatter is called by a batch notification job that processes thousands of accounts.

## Buggy code

```java
public class EmailFormatter {

    public String formatSubject(UserAccount account) {
        String displayName = account.getDisplayName();
        String userId = account.getUserId();
        return String.format("Hello %s (ID: %s), you have new messages!",
                displayName.toUpperCase(), userId);
    }

    static class UserAccount {
        private final String displayName;
        private final String userId; // may be null for guest accounts

        UserAccount(String displayName, String userId) {
            this.displayName = displayName;
            this.userId = userId;
        }

        String getDisplayName() { return displayName; }
        String getUserId() { return userId; }
    }
}
```
