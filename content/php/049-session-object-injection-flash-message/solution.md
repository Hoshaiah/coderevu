## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unserialized Session Flash Data
// ------------------------------------------------------------------------

<?php
// src/Http/FlashMessage.php

class FlashMessage
{
    public static function set(mixed $message): void
    {
        // Only store plain JSON-safe values; json_encode/decode avoids object injection entirely.
        // CHANGE 1+3: Replace serialize() with json_encode() so stored data can never instantiate objects on read.
        $_SESSION['_flash'] = json_encode($message);
    }

    public static function get(): mixed
    {
        // CHANGE 2: Remove the $_GET['flash'] fallback entirely — reading serialized/encoded data from user-controlled input is unsafe regardless of encoding.
        $raw = $_SESSION['_flash'] ?? null;

        if ($raw === null) {
            return null;
        }

        unset($_SESSION['_flash']);
        // CHANGE 1+3: Replace unserialize() with json_decode(); JSON cannot encode PHP objects so there is no gadget-chain risk.
        return json_decode($raw, true);
    }
}
```

## Explanation

### Issue 1: `unserialize()` on attacker-controlled input

**Problem:** `$_GET['flash']` is a URL parameter any user can set to any string. When `get()` falls back to `$_GET['flash']` and passes it to `unserialize()`, PHP instantiates whatever class is named in the serialized payload and immediately invokes `__wakeup()`. In a Symfony or Doctrine app, dozens of autoloaded classes have `__wakeup()` or `__destruct()` methods that write files, execute queries, or open network connections — a crafted payload can chain them to achieve remote code execution.

**Fix:** `serialize()` / `unserialize()` are replaced with `json_encode()` / `json_decode()` at the `set()` and `get()` call sites. JSON has no mechanism for encoding class names, so `json_decode()` can never instantiate a PHP object.

**Explanation:** `unserialize()` uses a PHP-specific wire format that embeds the class name and property values of any object. When PHP reads that format it calls the named class's constructor-like magic methods before your code has a chance to inspect the value. `json_decode()` produces only arrays, scalars, and `null` regardless of what the input string contains. Flash messages are almost always strings or shallow arrays, so `json_encode` covers real-world usage with no loss of functionality. The one trade-off is that `json_decode` cannot reconstruct typed objects — but storing typed objects in flash messages is itself a design smell that serialization was silently enabling.

---

### Issue 2: `$_GET` fallback introduces user-controlled session-equivalent data

**Problem:** The comment says the fallback was added "during a deployment issue and never removed." As written, an attacker crafts a URL with `?flash=<payload>` and visits any page that calls `FlashMessage::get()` — no session tampering required. The fallback defeats the server-side trust boundary of `$_SESSION` entirely.

**Fix:** The line `$raw = $_SESSION['_flash'] ?? $_GET['flash'] ?? null;` is replaced with `$raw = $_SESSION['_flash'] ?? null;`, removing `$_GET['flash']` from the expression.

**Explanation:** `$_SESSION` data is written by your server code and stored server-side; an external attacker has no direct write path to it. `$_GET` data is part of the HTTP request and is fully controlled by anyone who can send a request. Combining them with `??` means the security property of `$_SESSION` only holds when the session key happens to be set. If the session is empty — after a logout, a fresh browser, or exactly the deployment scenario the fallback was meant for — the code falls through to the attacker-controlled value. Removing the fallback means that when session storage is unavailable the flash simply returns `null`, which is gracefully handled by the `if ($raw === null)` check already in place.

---

### Issue 3: `unserialize()` without `allowed_classes` on session data

**Problem:** Even ignoring the `$_GET` fallback, calling `unserialize($_SESSION['_flash'])` without restricting allowed classes means a compromised or forged session cookie (possible if the session secret leaks, or if the session backend — Redis, Memcached, a shared filesystem — is writable by another process) can still trigger object injection. PHP will happily instantiate any autoloaded class found in the payload.

**Fix:** Switching to `json_encode()` / `json_decode()` (CHANGE 1+3 sites) eliminates the problem at the encoding level rather than trying to allowlist classes. There is no `allowed_classes` option to misconfigure because JSON decoding cannot produce objects at all.

**Explanation:** PHP added the `allowed_classes` option to `unserialize()` in PHP 7 specifically because unrestricted deserialization is dangerous. Passing `allowed_classes: false` would block object instantiation, but it still runs the parser over the full payload and any future developer can accidentally change the option. Replacing the mechanism with `json_encode`/`json_decode` removes the risk at the architectural level: the stored format is incapable of representing a class name, so the restriction cannot be accidentally removed. Flash messages hold display strings or simple key-value arrays; JSON handles both without any behavioral difference the application would notice.
