---
slug: nullpointerexception-on-optional-chained-get
track: java
orderIndex: 66
title: Null Return Inside Optional Map Chain
difficulty: easy
tags:
  - nulls
  - optional
  - exceptions
language: java
---

## Context

This utility lives in `src/main/java/com/example/user/UserService.java` and resolves the display name for a user given their ID. The `profileRepository.findById()` returns a standard `Optional<UserProfile>`, and the method is expected to return an empty `Optional` when no display name is available.

In production, certain user IDs cause a `NullPointerException` with a stack trace pointing into the `Optional.map` pipeline. The affected users all have a `UserProfile` row but their `displayName` column is `NULL` in the database, meaning the ORM sets the field to `null` on the deserialized object.

The team already confirmed that `profileRepository.findById()` returns a non-empty `Optional` for these users, so the NPE does not originate from an absent profile. Wrapping the call in a null check before `findById` was added to the call site, but the NPE persists.

## Buggy code

```java
import java.util.Optional;

public class UserService {
    private final UserProfileRepository profileRepository;

    public UserService(UserProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    public Optional<String> getDisplayName(long userId) {
        return profileRepository.findById(userId)
                .map(profile -> profile.getDisplayName());
    }
}
```
