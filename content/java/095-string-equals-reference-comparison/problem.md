---
slug: string-equals-reference-comparison
track: java
orderIndex: 95
title: String Identity vs Equality Check
difficulty: easy
tags:
  - correctness
  - nulls
  - collections
language: java
---

## Context

This code lives in `src/main/java/com/example/auth/RoleChecker.java`, a security utility called by servlet filters to gate access to admin endpoints. It checks whether a user's role string, loaded from a database `ResultSet`, is equal to the string `"ADMIN"` before allowing access.

In production, users whose role is stored as `ADMIN` in the database are being incorrectly denied access to admin pages, even though their role is clearly visible in the DB as `ADMIN`. The bug is 100% reproducible for database-sourced strings but never occurs in unit tests that pass string literals directly.

## Buggy code

```java
public class RoleChecker {

    public boolean isAdmin(String role) {
        // Check if the user has the ADMIN role
        if (role == "ADMIN") {
            return true;
        }
        return false;
    }

    public boolean hasRole(String role, String required) {
        return role == required;
    }
}
```
