## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Path Traversal in File Download
// ------------------------------------------------------------------------

<?php
// files/download.php

session_start();

if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit('Unauthorized');
}

$userId   = (int) $_SESSION['user_id'];
$filename = $_GET['file'] ?? '';

if ($filename === '') {
    http_response_code(400);
    exit('Missing file parameter');
}

$userDir  = "/var/app/uploads/$userId";
$filePath = $userDir . '/' . $filename;

// CHANGE 1: Resolve all symlinks and `../` sequences to an absolute canonical path before any access check.
$realPath = realpath($filePath);

// CHANGE 2: Reject the request if realpath() failed (file absent) OR if the resolved path does not begin with the user's own directory, preventing traversal to other users' files or arbitrary filesystem paths.
if ($realPath === false || strpos($realPath, realpath($userDir) . '/') !== 0) {
    http_response_code(404);
    exit('File not found');
}

// CHANGE 3: Use basename() on the resolved canonical path (not the raw user input) for the Content-Disposition header to strip any path components and prevent header injection via embedded newlines.
$safeBasename = basename($realPath);

header('Content-Type: application/octet-stream');
header('Content-Disposition: attachment; filename="' . $safeBasename . '"');
readfile($realPath);
```

## Explanation

### Issue 1: Path traversal bypasses directory restriction

**Problem:** A logged-in user requests `download.php?file=../../1/sensitive_contract.pdf`. The code appends that string directly to the user's upload directory, producing `/var/app/uploads/99/../../1/sensitive_contract.pdf`, which the OS resolves to `/var/app/uploads/1/sensitive_contract.pdf`. `file_exists` confirms the file is there, and `readfile` sends it — the attacker reads another user's file without any error.

**Fix:** Call `realpath($filePath)` immediately after building the path (CHANGE 1) to resolve all `../` sequences and symlinks into an absolute canonical path before any further processing.

**Explanation:** The OS silently normalizes `../` traversals whenever a path is opened, but PHP's `file_exists` and `readfile` accept whatever string you pass them — they do not sanitize first. So checking `file_exists` on the raw string lets the OS do the traversal while the PHP check is none the wiser. `realpath()` performs the same OS normalization up front and returns the true absolute path, or `false` if the path does not exist. Once you have the canonical path, you can compare it against the allowed prefix before doing anything else.

---

### Issue 2: Resolved path not verified against user's directory

**Problem:** Even after calling `realpath()`, the original code never confirms that the resulting path actually lives under the authenticated user's upload directory. Without that check, a traversal to `/etc/passwd` that happens to `realpath` successfully would still reach `readfile`.

**Fix:** Add a `strpos` guard at CHANGE 2 that rejects the request if `$realPath` is `false` or does not start with `realpath($userDir) . '/'`. The trailing `/` is required so that a directory named `/var/app/uploads/99extra` cannot match as a prefix of `/var/app/uploads/99`.

**Explanation:** `realpath()` alone only tells you the canonical path exists; it says nothing about where that path is. The prefix check ties the resolved path back to the specific user's directory, enforcing the intended ownership boundary. Using `realpath()` on `$userDir` as well (not just on `$filePath`) ensures symlinked upload directories are handled correctly. The trailing `/` in the comparison string is a common pitfall: without it, `/var/app/uploads/99` would also match a path starting with `/var/app/uploads/990/`, bypassing the intended restriction.

---

### Issue 3: Unsanitized filename in Content-Disposition header

**Problem:** The original code writes `basename($filename)` — where `$filename` is raw user input — into the `Content-Disposition` header. An attacker can include a newline character (`%0d%0a`) in the query string to inject arbitrary HTTP response headers, potentially setting `Set-Cookie` or `Location` headers in the victim's browser.

**Fix:** At CHANGE 3, replace `basename($filename)` with `basename($realPath)`, where `$realPath` is the validated canonical path returned by `realpath()`. This name is derived from the actual filesystem entry, not from user input, and cannot contain newlines.

**Explanation:** HTTP header values are newline-delimited. If a newline appears in a header value, every character after it is interpreted as a new header by the browser. PHP's `header()` function does strip bare `\n` in some versions, but relying on that is fragile and version-dependent. The safe approach is to never put raw user input into a header value at all. Because `$realPath` was already verified to be a real file under the allowed directory, its `basename()` is a filesystem-derived string that cannot contain path separators or newline characters.
