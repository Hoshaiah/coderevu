---
slug: list-contains-wrong-type-silent-false
track: java
orderIndex: 37
title: contains() on Wrong Type Returns False
difficulty: easy
tags:
  - collections
  - nulls
  - exceptions
language: java
---

## Context

This snippet is from `src/main/java/com/example/access/RoleChecker.java`, part of an authorization subsystem. Role IDs are stored as `Integer` objects in a `List<Integer>`. The `hasRole` method is called from an HTTP filter to decide whether to allow or deny a request.

Security reviewers discovered that certain users who should be denied access are being granted it. Audit logs show `hasRole()` returning `false` when it should return `true`, causing the filter to fall through to a permissive default. The affected users all have role IDs that are passed as `long` primitives from the JWT parsing library.

The team confirmed the role list is populated correctly — when they print it and the target ID, the value is present. The bug is not in the data.

## Buggy code

```java
import java.util.List;

public class RoleChecker {
    private final List<Integer> allowedRoles;

    public RoleChecker(List<Integer> allowedRoles) {
        this.allowedRoles = allowedRoles;
    }

    public boolean hasRole(long roleId) {
        // roleId comes from JWT library as a long primitive
        return allowedRoles.contains(roleId);
    }
}
```
