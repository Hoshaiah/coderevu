## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Request logger writes raw User-Agent header into log file, enabling log injection
// ------------------------------------------------------------------------
<?php
// middleware/request_logger.php

// CHANGE 1: Strips newline characters (\r and \n) from any field that comes from untrusted external input before it reaches the log.
function sanitize_log_field(string $value): string
{
    // CHANGE 1: Remove carriage-return and line-feed to prevent log injection.
    return str_replace(["\r", "\n"], ['', ''], $value);
}

function log_request(int $userId): void
{
    // CHANGE 2: Sanitize every header-derived field, not just User-Agent, because an attacker can also inject via X-Forwarded-For spoofing or a crafted URI.
    $ip        = sanitize_log_field($_SERVER['REMOTE_ADDR']     ?? 'unknown');
    $method    = sanitize_log_field($_SERVER['REQUEST_METHOD']  ?? 'UNKNOWN');
    $uri       = sanitize_log_field($_SERVER['REQUEST_URI']     ?? '/');
    // CHANGE 1: sanitize_log_field applied here — was written raw before.
    $userAgent = sanitize_log_field($_SERVER['HTTP_USER_AGENT'] ?? '');
    $timestamp = date('Y-m-d H:i:s');

    // CHANGE 3: Cast $userId explicitly to int (it is already typed int, but this makes intent clear) so it can never carry string injection content.
    $safeUserId = (int) $userId;

    $line = "[{$timestamp}] user={$safeUserId} ip={$ip} method={$method} uri={$uri} ua={$userAgent}";

    file_put_contents(
        '/var/log/app/requests.log',
        $line . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}
```

## Explanation

### Issue 1: Log injection via User-Agent newlines

**Problem:** The `$userAgent` value is taken straight from `$_SERVER['HTTP_USER_AGENT']` and concatenated into the log line without any modification. An attacker sends a `User-Agent` header that contains `\n` followed by a fabricated log entry such as `[2024-01-01 00:00:00] user=99 ip=10.0.0.1 method=POST uri=/admin/transfer ua=curl`. The log file then contains that forged line as if it were a real audit record.

**Fix:** A new `sanitize_log_field()` helper is added. It calls `str_replace(["\r", "\n"], ['', ''], $value)` to strip carriage-return and line-feed characters. The `$userAgent` assignment is wrapped with `sanitize_log_field()` at the `CHANGE 1` site.

**Explanation:** A flat-text log file uses newlines as record delimiters. When user-controlled data can contain newlines and is written verbatim, the attacker controls where one record ends and the next begins. The audit log loses integrity — a compliance auditor or SIEM reading the file cannot distinguish real entries from injected ones. Stripping `\r` and `\n` before the value enters the log line closes that delimiter-injection path. Note that URL-encoded newlines (`%0a`) are decoded by the web server before PHP sees `REQUEST_URI`, so the same stripping must apply to the URI field as well.

---

### Issue 2: Other request fields written without sanitization

**Problem:** Only `$userAgent` gets attention in a typical fix, but `$uri`, `$method`, and even `$ip` are concatenated raw in the original code. A crafted `REQUEST_URI` like `/search?q=foo%0a[fake log line]` produces the same injection as the User-Agent vector. On servers behind a proxy, `REMOTE_ADDR` may reflect a spoofable header.

**Fix:** At the `CHANGE 2` site, `sanitize_log_field()` is applied to all four header-derived variables — `$ip`, `$method`, `$uri`, and `$userAgent` — so every field goes through the same stripping before the line is assembled.

**Explanation:** Treating only the most obvious field leaves the others as open injection points. An attacker who notices `User-Agent` is sanitized will simply try the URI next. Applying one consistent helper to every externally-sourced field removes the whole class of vulnerability rather than patching one symptom. The helper is inlined at each assignment, keeping the fix localized and easy to audit.

---

### Issue 3: $userId embedded without explicit integer coercion

**Problem:** PHP's `int` type hint prevents a caller from passing a non-integer at call time in strict mode, but the underlying value is never explicitly coerced before string interpolation. If strict types are not declared and a caller passes a string like `"42\nuser=99 ..."`, the type hint performs a silent cast and the injection survives.

**Fix:** At the `CHANGE 3` site, `$safeUserId = (int) $userId;` is added, and `$safeUserId` is used in the log line instead of `$userId` directly, making the integer coercion explicit and guaranteed regardless of the calling context.

**Explanation:** PHP type hints on function parameters are enforced strictly only when `declare(strict_types=1)` is present in the calling file. Without it, PHP coerces a string to int by taking the leading numeric part, but a string like `"0\nfake=line"` becomes `0` only after coercion — the coercion happens before the hint triggers an error, yet without the explicit cast inside the function the original string value could be used if the variable were referenced before coercion. Explicitly casting to `(int)` inside the function body makes the log-safe value unambiguous and independent of the caller's strict-types setting.
