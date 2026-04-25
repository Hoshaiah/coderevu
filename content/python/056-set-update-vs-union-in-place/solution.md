## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Set Union Returns New Set
# ------------------------------------------------------------------------

def build_effective_permissions(
    user_permissions: set[str],
    group_permissions_list: list[set[str]],
) -> set[str]:
    effective = user_permissions.copy()
    for group_perms in group_permissions_list:
        # CHANGE 1: use update() instead of union() so group_perms are merged into effective in-place; union() returns a new set and discards the result.
        effective.update(group_perms)
    return effective
```

## Explanation

### Issue 1: `set.union()` Result Silently Discarded

**Problem:** Every API request returns only the user's direct permissions. Group-inherited permissions are never present in the effective set, so users cannot access resources their groups should grant them. Removing all direct permissions from a user produces an empty permission set even when their groups have permissions assigned.

**Fix:** Replace `effective.union(group_perms)` with `effective.update(group_perms)` at the CHANGE 1 site. `update()` merges the contents of `group_perms` directly into `effective` in-place and returns `None`, which is the intended behavior.

**Explanation:** `set.union()` is a non-mutating method — it creates and returns a brand-new set containing the combined elements, leaving the original set unchanged. The original code calls `effective.union(group_perms)` but never assigns the return value anywhere, so the newly created set is immediately thrown away. After the loop finishes, `effective` still holds only the copy of `user_permissions`. `set.update()`, by contrast, mutates the set it is called on by adding all elements from the argument, which is exactly what the loop intends to do. A related pitfall: the `|` operator also returns a new set, so `effective = effective | group_perms` inside the loop would also fix the bug, but `update()` is more direct and avoids creating a new object on each iteration.
