---
slug: string-intern-equality-trap
track: java
orderIndex: 62
title: String Equality via Reference Comparison
difficulty: easy
tags:
  - nulls
  - collections
  - string-comparison
language: java
---

## Context

This authorization helper lives in `src/main/java/com/acme/auth/RoleChecker.java`. It is called by a servlet filter on every authenticated request to verify that the user holds a required role. Roles are loaded from a JWT claim and returned as plain `String` objects by the JWT parsing library.

In production, certain users who demonstrably have the `ADMIN` role in their JWT are intermittently denied access. Replicating with a hardcoded string literal in tests always passes. The bug is not consistently reproducible — it depends on which JWT library version is deployed and how the role strings were constructed at runtime.

A junior developer added a `System.out.println(role + " == " + required)` that always prints `ADMIN == ADMIN` right before the check that returns false, which deepened the confusion.

## Buggy code

```java
import java.util.List;

public class RoleChecker {

    public boolean hasRole(List<String> userRoles, String requiredRole) {
        for (String role : userRoles) {
            if (role == requiredRole) {
                return true;
            }
        }
        return false;
    }
}
```
