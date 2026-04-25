## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unserialize on URL Parameter Input
// ------------------------------------------------------------------------

<?php
// api/preview.php

header('Content-Type: application/json');

require_once __DIR__ . '/../vendor/autoload.php';

// CHANGE 3: Verify the request carries a valid HMAC-SHA256 signature before touching the payload; without this any attacker can craft a malicious cart string.
$secret = defined('CART_HMAC_SECRET') ? CART_HMAC_SECRET : getenv('CART_HMAC_SECRET');
$cartData = $_GET['cart'] ?? '';
$sig      = $_GET['sig']  ?? '';

if ($cartData === '') {
    echo json_encode(['items' => []]);
    exit;
}

// CHANGE 3: Reject the request immediately if the HMAC does not match, preventing any deserialisation of unsigned data.
if (!$secret || !hash_equals(hash_hmac('sha256', $cartData, $secret), $sig)) {
    http_response_code(403);
    echo json_encode(['error' => 'Invalid signature']);
    exit;
}

// CHANGE 1: Replace unserialize() with json_decode(); JSON decoding never instantiates PHP objects and is therefore not vulnerable to object-injection gadget chains.
// CHANGE 2: By using json_decode() we eliminate the need for an allowed_classes whitelist entirely — there are no classes to instantiate from JSON.
$cart = json_decode(base64_decode($cartData), true);

if (!is_array($cart)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid cart']);
    exit;
}

$total = 0;
$preview = [];
foreach ($cart as $item) {
    // Validate that required keys exist before accessing them to avoid PHP notices on malformed entries.
    if (!isset($item['name'], $item['qty'], $item['price'])) {
        continue;
    }
    $preview[] = [
        'name'  => htmlspecialchars((string) $item['name']),
        'qty'   => (int) $item['qty'],
        'price' => (float) $item['price'],
    ];
    $total += (int) $item['qty'] * (float) $item['price'];
}

echo json_encode(['items' => $preview, 'total' => $total]);
```

## Explanation

### Issue 1: PHP Object Injection via `unserialize()`

**Problem:** The original code calls `unserialize()` on data taken directly from the `$_GET['cart']` query parameter. An attacker who controls that string can embed a serialised PHP object of any class that has been loaded by the autoloader. When PHP deserialises the object, it calls magic methods like `__wakeup()` and `__destruct()` automatically, which in many popular libraries (Guzzle, Monolog, Symfony components, etc.) can be chained together to write arbitrary files, execute shell commands, or make network requests. The ops team saw PHP files appearing under `/tmp/` and the web root because a gadget chain in a loaded library was triggered this way.

**Fix:** At CHANGE 1, `unserialize(base64_decode($cartData))` is replaced with `json_decode(base64_decode($cartData), true)`. The front-end is changed to store cart data as JSON in `localStorage` instead of a serialised PHP string.

**Explanation:** `unserialize()` is a PHP-level object factory: it reads a type tag from the input string and constructs real PHP objects, running any magic methods they define. JSON decoding with `json_decode(..., true)` returns only PHP scalars and associative arrays — it never instantiates a class. Because the payload is now plain data, there is no execution surface regardless of what libraries are loaded. If switching to JSON is temporarily impossible, the minimum mitigation is to pass `['allowed_classes' => false]` as the second argument to `unserialize()`, which causes any object tag in the payload to return `false` instead of constructing the object; however, this still leaves the code accepting unverified serialised data, so JSON is strongly preferred.

---

### Issue 2: No Allowed-Classes Constraint on Deserialisation

**Problem:** Even if the intent were to keep `unserialize()`, the original call passes no options array, meaning PHP will happily construct objects of any class the autoloader can find. In a Composer project with dozens of dependencies this is a large attack surface. The symptom is the same as Issue 1 — arbitrary code execution — but this is a separate, independent control that should be locked down.

**Fix:** CHANGE 2 is handled implicitly by the switch to `json_decode()` at CHANGE 1. If `unserialize()` had to be kept, the fix would be to add `['allowed_classes' => false]` as the second argument, refusing to instantiate any class from the input.

**Explanation:** PHP 7.0 introduced an options array for `unserialize()`. Setting `allowed_classes` to `false` means that when the deserialiser encounters an `O:` (object) tag in the input string it produces an incomplete `__PHP_Incomplete_Class` value instead of constructing the real class and running its magic methods. Setting it to an array of class-name strings allows only those specific classes. The defence-in-depth value is real, but it is weaker than avoiding `unserialize()` altogether because researchers regularly discover gadget chains in classes that appear innocuous. Switching to JSON removes the problem at its root.

---

### Issue 3: No Integrity Check on the Cart Parameter

**Problem:** Anyone who knows the URL structure can hand-craft a `cart` parameter. Without a server-side secret involved in producing the value, there is no way for the server to distinguish a payload the front-end produced legitimately from one an attacker constructed. Even after fixing Issues 1 and 2, a missing integrity check means an attacker can still tamper with prices, quantities, and item names.

**Fix:** CHANGE 3 adds HMAC-SHA256 signing. The server reads a secret from a constant or environment variable, expects a `sig` query parameter containing `hash_hmac('sha256', $cartData, $secret)`, and uses `hash_equals()` to compare in constant time. The request is rejected with HTTP 403 if the signature is absent or wrong.

**Explanation:** An HMAC binds the payload to a server-side secret that the client never sees. When the front-end saves a cart it must request a signed token from the server (or the server embeds the signature when the cart is first serialised); the signature travels alongside the payload. On the next request, the server recomputes the HMAC over the received payload and compares with `hash_equals()`, which avoids timing side-channels that a naive `===` comparison would expose. Because the attacker does not know the secret they cannot produce a valid signature for a modified payload, so forged or replayed-with-modification carts are rejected before any deserialisation or business logic runs.
