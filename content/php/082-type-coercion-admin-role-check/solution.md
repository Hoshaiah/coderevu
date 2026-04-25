## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Role Comparison Grants Admin Access
// ------------------------------------------------------------------------

<?php
// middleware/require_admin.php

require_once __DIR__ . '/../config/roles.php';
// roles.php defines: const ROLE_ADMIN = 1;
// CHANGE 1: Replace loose == with strict === so PHP never coerces types; 'viewer' === 1 is always false, 'admin' === 1 is also always false.
// CHANGE 2: Compare $role against the string literal 'admin' instead of ROLE_ADMIN (int 1) so the type matches the VARCHAR value stored in the session.

session_start();

if (!isset($_SESSION['user_id'])) {
    header('Location: /login.php');
    exit;
}

$role = $_SESSION['role'] ?? null;

// Intended: only let through users whose role equals 'admin'
if ($role === 'admin') { // CHANGE 1+2: strict identity check against the string 'admin' matches the VARCHAR session value exactly and never type-juggles
    return; // access granted
}

header('Location: /dashboard.php');
exit('Access denied.');
```

## Explanation

### Issue 1: Loose Equality Type Juggling Bypasses Guard

**Problem:** The condition `$role == ROLE_ADMIN` uses PHP's loose `==` operator. When PHP compares a non-numeric string to an integer under loose equality (PHP 7 rules), it casts the string to `0`. `ROLE_ADMIN` is `1`, so `'viewer' == 1` evaluates to `false` — that part accidentally works. But the complementary danger is that `'admin' == 1` is *also* `false` (because `'admin'` casts to `0`), meaning legitimate admins are locked out too. The reported bypass likely surfaced from a prior code state or a PHP 8 context where the juggling direction changed.

**Fix:** Replace `==` with `===` on the comparison line. The reference solution uses `$role === 'admin'` so PHP performs an identity check: both value and type must match. No coercion happens.

**Explanation:** PHP's `==` with a mixed string/integer pair applies numeric context to the string in PHP 7: `(int)'viewer'` is `0`, `(int)'admin'` is `0`, so neither equals `1`. In PHP 8 the rule reversed — integers are cast to strings for comparison — making `'viewer' == 1` false and `'1' == 1` true, but `'admin' == 1` still false. Strict `===` sidesteps all of this: it returns `true` only when both operands share the same type and value, so `'admin' === 'admin'` is `true` and `'viewer' === 'admin'` is `false` with no coercion at all. A related pitfall is that `0 == 'anything'` is `true` in PHP 7, which has caused authentication bypasses when a zero-value ID or role constant is compared loosely against user-supplied strings.

---

### Issue 2: Constant Type Mismatch Between Integer and VARCHAR String

**Problem:** `ROLE_ADMIN` is defined as integer `1` in `config/roles.php`, but `$_SESSION['role']` is populated from a VARCHAR column that stores the string `'admin'`. Even with strict `===`, `'admin' === 1` is `false`, so no admin would ever pass the check. The session value and the constant live in different type universes.

**Fix:** The reference solution drops `ROLE_ADMIN` from the comparison entirely and compares `$role` directly against the string literal `'admin'`. If a named constant is still desired, `roles.php` should redefine it as `const ROLE_ADMIN = 'admin'`.

**Explanation:** The root design error is storing human-readable strings in the database but defining role constants as integers, then comparing them without any mapping layer. When `$_SESSION['role']` is set from the database result, it carries the string `'admin'`. A strict comparison against integer `1` will always be `false` regardless of the operator, because `'admin'` and `1` can never be identical. Fixing the constant to match the stored type (`const ROLE_ADMIN = 'admin'`) would also solve this, but the reference solution makes the type visible at the call site by using the literal string, which removes any ambiguity about what value the constant holds. Going forward, either keep all role identifiers as strings throughout (DB, session, constants) or use an integer in the DB and map it to a constant before storing in the session — mixing types across layers is what caused the confusion here.
