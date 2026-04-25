## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Path Traversal in File Download
// ------------------------------------------------------------------------

<?php
// public/downloads/serve.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

$user_id = $_SESSION['user_id'] ?? null;
if (!$user_id) {
    http_response_code(401);
    echo 'Unauthorized';
    exit;
}

$filename = $_GET['file'] ?? '';
if ($filename === '') {
    http_response_code(400);
    echo 'Missing file parameter';
    exit;
}

// CHANGE 1: Strip any directory components from the filename before building the path, so `../` sequences are removed and the value is treated as a plain filename only.
$filename  = basename($filename);

$base_dir  = '/var/app/exports/' . $user_id . '/';
$full_path = $base_dir . $filename;

// CHANGE 2: Resolve the real path and verify it still starts with the intended base directory, blocking any remaining traversal attempts (e.g. symlinks or encoded sequences that survive basename).
$real_base = realpath($base_dir);
$real_path = realpath($full_path);
if ($real_base === false || $real_path === false || strpos($real_path, $real_base . DIRECTORY_SEPARATOR) !== 0) {
    http_response_code(403);
    echo 'Access denied';
    exit;
}

if (!file_exists($real_path)) {
    http_response_code(404);
    echo 'File not found';
    exit;
}

// CHANGE 3: Use the already-sanitized `basename`-derived filename for the Content-Disposition header and strip any CR/LF characters to prevent header injection.
$safe_name = str_replace(["\r", "\n"], '', $filename);
header('Content-Type: text/csv');
header('Content-Disposition: attachment; filename="' . $safe_name . '"');
readfile($real_path);
exit;
```

## Explanation

### Issue 1: Path traversal via unsanitized filename

**Problem:** The `file` GET parameter is appended directly to the user directory path without stripping directory traversal sequences. An attacker passes a value like `../../etc/passwd`, which causes `$full_path` to resolve outside the intended user directory, allowing reads of arbitrary files the web server user can access.

**Fix:** `basename($filename)` is applied to `$filename` immediately after retrieval (CHANGE 1), discarding every directory component and leaving only the bare filename segment.

**Explanation:** `basename()` removes everything up to and including the last directory separator, so `../../etc/passwd` becomes `passwd` and `../bootstrap.php` becomes `bootstrap.php`. This alone removes the most direct attack vector. However, `basename()` operates on the string before the filesystem resolves it, so it does not handle edge cases like symlinks pointing outside the tree, which is why CHANGE 2 adds a second layer of defense.

---

### Issue 2: No canonical-path containment check

**Problem:** Even after stripping directory separators, it is possible (through symlinks or platform-specific encoding) for a resolved path to fall outside the intended directory. Without a containment check, the code silently serves files from unexpected locations.

**Fix:** CHANGE 2 calls `realpath()` on both the base directory and the constructed full path, then verifies that `$real_path` starts with `$real_base . DIRECTORY_SEPARATOR`. If either `realpath()` call returns `false` (path does not exist or is inaccessible) or the prefix check fails, the request is rejected with a 403.

**Explanation:** `realpath()` resolves all symlinks and normalizes `.` and `..` segments, producing an absolute canonical path. Checking that the file's canonical path begins with the canonical base directory guarantees the file physically lives inside that directory tree on disk. The `DIRECTORY_SEPARATOR` suffix is appended to the base before comparison so that a directory named `/var/app/exports/1extra/` could not accidentally match a base of `/var/app/exports/1/`. Returning `false` when a path does not exist is handled explicitly to avoid a situation where a nonexistent `$real_path` of `false` incorrectly passes the `strpos` check.

---

### Issue 3: Header injection via unsanitized Content-Disposition filename

**Problem:** The original code passes `basename($filename)` directly into the `Content-Disposition` header. If the filename contains a carriage-return or newline character, an attacker can inject additional HTTP response headers, potentially setting `Set-Cookie` or manipulating caching directives for the victim.

**Fix:** CHANGE 3 runs `str_replace(["\r", "\n"], '', $filename)` on the already `basename`-processed filename before embedding it in the header string, removing the characters that would allow header splitting.

**Explanation:** HTTP headers are terminated by `\r\n`, so embedding a literal `\r\n` inside a header value ends that header and begins a new one. PHP's `header()` function does not automatically sanitize its argument. Because `$filename` at this point has already passed through `basename()`, the risk is reduced, but a filename like `report.csv\r\nSet-Cookie: session=hijacked` could still arrive from a crafted request and survive `basename()`. Stripping CR and LF characters eliminates the injection vector entirely.
