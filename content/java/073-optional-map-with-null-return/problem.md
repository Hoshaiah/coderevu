---
slug: optional-map-with-null-return
track: java
orderIndex: 73
title: Optional Map Lambda Returns Null
difficulty: hard
tags:
  - nulls
  - exceptions
  - correctness
language: java
---

## Context

This user-profile service lives in `src/main/java/com/example/profile/ProfileService.java`. It looks up a user by ID, then maps to the user's display name. The `displayName` field is nullable in the database — users who registered via SSO before the display-name feature existed have `null` there, and the code is supposed to fall back to the username in that case.

In production, SSO users trigger a `NullPointerException` deep inside the `Optional` machinery when their profile is fetched. The stack trace points to `Optional.map`, which the team believed was null-safe. The `orElse("Anonymous")` at the end was supposed to handle missing values.

Reviewing the `Optional` JavaDoc reveals the root cause, but several developers on the team had the wrong mental model of how `Optional.map` treats a `null` return value from the mapping function.

## Buggy code

```java
import java.util.Optional;

public class ProfileService {

    public static class User {
        final String username;
        final String displayName; // nullable
        User(String username, String displayName) {
            this.username = username;
            this.displayName = displayName;
        }
    }

    private final UserRepository repo;

    public ProfileService(UserRepository repo) {
        this.repo = repo;
    }

    public String getDisplayName(long userId) {
        return repo.findById(userId)
                .map(u -> u.displayName)  // displayName may be null
                .orElse("Anonymous");
    }

    interface UserRepository {
        Optional<User> findById(long id);
    }
}
```
