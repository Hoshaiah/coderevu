## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — JSON Boolean Coerced to Admin Role
// ------------------------------------------------------------------------

<?php
// middleware/RoleCheck.php

class RoleCheck
{
    public function requireAdmin(array $tokenPayload): void
    {
        $role = $tokenPayload['role'] ?? null;

        // CHANGE 1: Replace != with !== so PHP does not coerce bool true to equal the string 'admin' via type juggling.
        if ($role !== 'admin') {
            throw new UnauthorizedException('Admin role required');
        }
    }

    public function requireRole(array $tokenPayload, string $requiredRole): void
    {
        $role = $tokenPayload['role'] ?? null;

        // CHANGE 2: Replace != with !== so any truthy non-string value (e.g. bool true) cannot loosely equal a non-empty required role string.
        if ($role !== $requiredRole) {
            throw new UnauthorizedException("Role '$requiredRole' required");
        }
    }
}
```

## Explanation

### Issue 1: Loose Equality Grants Admin via Boolean `true`

**Problem:** Any JWT token with `"role": true` passes the `requireAdmin` check and receives admin access. Engineers see `!= 'admin'` and assume a boolean `true` cannot equal the string `'admin'`, but in practice the accounts with `role: true` in their tokens are treated as admins.

**Fix:** Replace `!=` with `!==` on the comparison inside `requireAdmin`. The reference solution changes line `if ($role != 'admin')` to `if ($role !== 'admin')`.

**Explanation:** PHP's loose equality operator `!=` applies type juggling before comparing values. When PHP compares a boolean against a non-empty string, it converts the string to a boolean first — `(bool)'admin'` is `true` — so `true != 'admin'` evaluates to `false`, meaning the guard condition is not triggered and no exception is thrown. The strict operator `!==` skips type coercion entirely and requires both value and type to match, so `true !== 'admin'` is `true`, the exception fires, and access is denied. A related pitfall: `false != ''` is also `false` in PHP, so a zero or empty role could also slip through comparisons on the other side of the spectrum.

---

### Issue 2: Same Loose Equality Bug in Generic `requireRole`

**Problem:** `requireRole` has the identical flaw. A token with any truthy non-string role value — `true`, `1`, a non-empty array — can loosely equal any non-empty `$requiredRole` string, bypassing the role gate for any role the caller checks, not only `'admin'`.

**Fix:** Replace `!=` with `!==` in `requireRole`. The reference solution changes `if ($role != $requiredRole)` to `if ($role !== $requiredRole)`.

**Explanation:** Because `$requiredRole` is typed as `string`, PHP will still apply loose-comparison juggling to the left-hand operand `$role`, which comes from an untyped array and could be any PHP type the JWT decoder produced. With `!==`, both operands must be strings of identical value for the check to pass, so a boolean or integer role can never satisfy a string requirement. Centralising role checks in one method makes this a single fix point, but it also means the bug silently affected every role check in the service, not just admin routes.
