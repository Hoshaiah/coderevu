## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Loose Integer Key Lookup Collision
// ------------------------------------------------------------------------

<?php
// auth/permissions.php

// Cache populated by a background job; keys are stored as strings by the
// serialiser, but the values can include integer-keyed entries too.
$permissions_cache = [
    '0'        => 0b00000001, // guest
    'abc_svc'  => 0b11111111, // internal service account — full permissions
    42         => 0b00000110, // regular user #42
];

function get_permissions(mixed $user_id, array $cache): int
{
    // JWT library returns claims as mixed; numeric strings stay as strings,
    // but the library may return an int for numeric sub claims.
    if (isset($cache[$user_id])) {
        return $cache[$user_id];
    }
    return 0;
}

// Simulated JWT sub claim delivered as the string "0"
$user_id_from_jwt = '0';

$perms = get_permissions($user_id_from_jwt, $permissions_cache);
echo "Permissions bitmask: " . decbin($perms) . "\n"; // expected: 1

// Now simulate an attacker who crafts a JWT with sub = "abc_svc" — that's
// handled correctly. But what if the JWT library decodes sub = 0 as int 0?
$user_id_as_int = 0;
$perms2 = get_permissions($user_id_as_int, $permissions_cache);
echo "Permissions for int 0: " . decbin($perms2) . "\n";

// CHANGE 1: Replace the loose `==` foreach loop with a strict identity check using `===` so that integer 0 never matches a non-numeric string key like 'abc_svc'.
// CHANGE 2: Use the same direct-index pattern as get_permissions — cast $user_id to string for a normalised strict lookup — instead of iterating with a loose comparison.
function has_permission(mixed $user_id, array $cache, int $required_bit): bool
{
    // Normalise the user_id to a string key so that both int 0 and string '0'
    // resolve to the same cache slot and no non-numeric key is ever matched by
    // an integer zero.
    $key = (string)$user_id; // CHANGE 2: cast to string for canonical key lookup
    if (array_key_exists($key, $cache)) { // CHANGE 1: strict key lookup, not loose == comparison in a loop
        return (bool)($cache[$key] & $required_bit);
    }
    return false;
}

$can_admin = has_permission(0, $permissions_cache, 0b10000000);
echo $can_admin ? "ACCESS GRANTED\n" : "access denied\n"; // must print: access denied
```

## Explanation

### Issue 1: Loose `==` matches integer 0 to non-numeric strings

**Problem:** `has_permission` iterates over `$cache` and compares each key to `$user_id` with `==`. In PHP, `0 == 'abc_svc'` is `true` because a non-numeric string coerces to `0` in a loose integer comparison. An attacker who controls the JWT `sub` claim and gets the library to emit it as integer `0` is immediately matched against the `'abc_svc'` entry — the first non-numeric string key in the array — and receives its `0b11111111` bitmask, bypassing every permission gate.

**Fix:** The foreach loop is replaced with `array_key_exists($key, $cache)` where `$key` is the result of `(string)$user_id`. `array_key_exists` performs a strict type-and-value match on the key, so integer `0` cast to string `'0'` looks up exactly the `'0'` slot and never touches `'abc_svc'`.

**Explanation:** PHP's `==` operator coerces operands to a common type before comparing. When one side is an integer and the other is a non-numeric string, the string is cast to `int`, yielding `0`. So `0 == 'abc_svc'` evaluates to `0 == 0`, which is `true`. PHP's array key lookup via `$array[$key]` or `array_key_exists` does NOT do this coercion — it matches by strict key identity (modulo the well-known string-that-looks-like-int normalisation). By casting `$user_id` to string first and then using `array_key_exists`, both the lookup type and the comparison are strict, so only a caller who literally supplies `'abc_svc'` or integer `42` can reach those cache entries.

---

### Issue 2: Redundant foreach bypasses the safe direct-lookup pattern

**Problem:** `get_permissions` uses the correct and safe pattern — `isset($cache[$user_id])` — which relies on PHP's native array key resolution and does not do loose comparison. `has_permission` re-implements the same lookup as a manual loop, introducing the loose-comparison bug and also making the code harder to audit because two functions that do the same conceptual thing have different internal mechanics.

**Fix:** `has_permission` is rewritten to use `array_key_exists($key, $cache)` after normalising the key with `(string)$user_id`, mirroring the direct-index approach used in `get_permissions`. The foreach loop is removed entirely.

**Explanation:** Iterating over a cache array to find a matching key is semantically equivalent to a direct index lookup only when the comparison operator is `===`. Any deviation — even a single `==` — opens a coercion path. The direct `array_key_exists` call delegates key resolution to PHP's engine, which interns string keys consistently and avoids any comparison-operator coercion. The `(string)` cast up front ensures that both integer `0` and string `'0'` map to the same canonical key `'0'`, matching the background serialiser's behaviour of storing IDs as strings, so the lookup semantics stay consistent regardless of what type the JWT library hands back.
