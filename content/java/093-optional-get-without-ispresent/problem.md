---
slug: optional-get-without-ispresent
track: java
orderIndex: 93
title: >-
  Calling Optional.get() without a presence check throws NoSuchElementException
  in production
difficulty: easy
tags:
  - api-misuse
  - optional
  - exceptions
language: java
---

## Context

This user profile service looks up an account by email and returns the user's display name. In development the email addresses used always exist, so the code was never observed to fail. In production, where users sometimes hit the endpoint with unregistered emails, the service returns a 500 error with `java.util.NoSuchElementException: No value present`.

The data access layer uses Java's `Optional<User>` as its return type to signal that a user may not be found.

## Buggy code

```java
import java.util.Optional;

public class UserProfileService {

    private final UserRepository repo;

    public UserProfileService(UserRepository repo) {
        this.repo = repo;
    }

    public String getDisplayName(String email) {
        Optional<User> user = repo.findByEmail(email);
        return user.get().getDisplayName();
    }
}
```
