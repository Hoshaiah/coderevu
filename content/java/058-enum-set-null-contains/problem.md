---
slug: enum-set-null-contains
track: java
orderIndex: 58
title: NullPointerException in EnumSet Contains
difficulty: easy
tags:
  - nulls
  - collections
  - exceptions
language: java
---

## Context

This permission-checking utility lives in `src/main/java/com/example/auth/PermissionGuard.java`. It is called from every REST controller before executing sensitive operations. The `EnumSet` is built from the roles granted to a user at login time and stored in the session.

In staging, a handful of requests from guest users (who have no roles at all) crash with a `NullPointerException` inside `hasPermission`. The stack trace points directly at the `contains` call, which surprises the team because they assume `Set.contains` is always null-safe.

The developers already verified that `requiredRole` is never null at call sites, and they confirmed that `grantedRoles` is populated from the database correctly for authenticated users. The bug only reproduces for unauthenticated guest sessions where the role list is empty.

## Buggy code

```java
import java.util.EnumSet;
import java.util.Set;

public class PermissionGuard {

    public enum Role { ADMIN, EDITOR, VIEWER }

    private final Set<Role> grantedRoles;

    public PermissionGuard(Set<Role> grantedRoles) {
        this.grantedRoles = EnumSet.copyOf(grantedRoles);
    }

    public boolean hasPermission(Role requiredRole) {
        return grantedRoles.contains(requiredRole);
    }
}
```
