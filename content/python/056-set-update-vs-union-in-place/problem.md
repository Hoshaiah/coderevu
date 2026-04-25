---
slug: set-update-vs-union-in-place
track: python
orderIndex: 56
title: Set Union Returns New Set
difficulty: easy
tags:
  - correctness
  - python-builtins
  - api-misuse
language: python
---

## Context

`acl/permissions.py` is part of an authorization module in a multi-tenant SaaS application. The `build_effective_permissions` function aggregates a user's direct permissions with those inherited from all their groups and returns the combined set. It is called on every API request after the JWT is validated.

Security auditors have flagged that users are sometimes able to access resources their group memberships should grant them. The effective permission set appears to only contain the user's direct permissions, ignoring group inheritance. Removing all direct permissions from a user confirms this: the effective set comes back empty even when the user is in groups with permissions.

Unit tests that test direct permissions pass; only integration tests that combine user and group permissions fail.

## Buggy code

```python
def build_effective_permissions(
    user_permissions: set[str],
    group_permissions_list: list[set[str]],
) -> set[str]:
    effective = user_permissions.copy()
    for group_perms in group_permissions_list:
        effective.union(group_perms)
    return effective
```
