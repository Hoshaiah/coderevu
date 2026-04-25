---
slug: type-coercion-loose-array-key-int
track: php
orderIndex: 97
title: Loose Integer Key Lookup Collision
difficulty: hard
tags:
  - type-coercion
  - security
  - auth
language: php
---

## Context

The permission lookup in `auth/permissions.php` loads a user's permission bitmask from a cache array keyed by user ID. The cache is populated by a background process that serialises IDs as strings. A thin wrapper function looks up the cache with the user ID pulled from the JWT payload, which is decoded as a PHP mixed type.

Security researchers found that a user with ID `0` can be used to look up the permissions of any user whose ID string, when compared loosely, equals zero — which in PHP includes non-numeric strings. The bug is subtle and only triggered by an unusual interaction between the JWT library's type handling and PHP's array lookup rules.

## Buggy code

```php
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
// PHP: $cache[0] checks integer key 0; '0' string key IS accessible via int 0
// in PHP's unified array, so this also returns guest. That's fine here.
//
// The real bug: what does PHP do when you look up a non-numeric string key
// in an array that has an integer key 0?
echo "Permissions for int 0: " . decbin($perms2) . "\n";

// Attacker-controlled scenario: $user_id = 0 (int) should NOT match 'abc_svc',
// but loose array coercion means a foreach search with == would do so.
// The bug manifests in the authorization check below:
function has_permission(mixed $user_id, array $cache, int $required_bit): bool
{
    foreach ($cache as $id => $bitmask) {
        if ($id == $user_id) { // loose comparison!
            return (bool)($bitmask & $required_bit);
        }
    }
    return false;
}

$can_admin = has_permission(0, $permissions_cache, 0b10000000);
echo $can_admin ? "ACCESS GRANTED\n" : "access denied\n";
```
