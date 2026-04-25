---
slug: nullpointerexception-iterator-empty-optional
track: java
orderIndex: 64
title: Optional flatMap Returns Null Silently
difficulty: easy
tags:
  - nulls
  - optional
  - exceptions
language: java
---

## Context

This method lives in `UserProfileService.java`, a service layer class used by a REST controller to look up a user's preferred shipping address. The stack is Spring Boot + Hibernate, and the method is called on every checkout page load.

In staging, the page loads fine for most users but throws a `NullPointerException` for users who have never saved an address. The stack trace points to `.get()` inside `getShippingCity`, but the team already confirmed the `Optional` returned by `findById` is never null itself — they can see it in the debugger.

A junior dev tried wrapping the whole thing in a try-catch for `NoSuchElementException`, which masked the real problem without fixing it.

## Buggy code

```java
import java.util.Optional;

public class UserProfileService {

    private final UserRepository userRepository;

    public UserProfileService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public Optional<String> getShippingCity(long userId) {
        return userRepository.findById(userId)
                .flatMap(user -> user.getShippingAddress())
                .map(address -> address.getCity());
    }

    // getShippingAddress() returns null when no address is saved,
    // not an empty Optional
    interface User {
        Address getShippingAddress();
    }

    interface Address {
        String getCity();
    }

    interface UserRepository {
        Optional<User> findById(long id);
    }
}
```
