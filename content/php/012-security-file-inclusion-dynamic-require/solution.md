## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Dynamic require_once Allows File Inclusion
// ------------------------------------------------------------------------

<?php
// public/index.php

$page = $_GET['page'] ?? 'home';

// CHANGE 1: Replace the naive str_replace with basename() so that ANY directory separator or traversal sequence is stripped by the OS-level path parser, not a fragile string search.
$page = basename($page);

// CHANGE 2: Enforce an explicit allowlist of valid page names so that only known pages can be dispatched, blocking access to any unexpected .php files even if they exist in pages/.
$allowed = ['home', 'about', 'contact', '404'];
if (!in_array($page, $allowed, true)) {
    $page = '404';
}

$file = __DIR__ . '/../pages/' . $page . '.php';

// CHANGE 3: Resolve the real absolute path and verify it starts with the expected pages directory, ensuring symlinks or any remaining oddities cannot escape the intended directory.
$pagesDir = realpath(__DIR__ . '/../pages');
$realFile = realpath($file);

if ($realFile === false || strpos($realFile, $pagesDir . DIRECTORY_SEPARATOR) !== 0) {
    $realFile = $pagesDir . DIRECTORY_SEPARATOR . '404.php';
}

require_once $realFile;
```

## Explanation

### Issue 1: Bypassable String Replacement for Traversal

**Problem:** The code removes `../` and `..\` literally, but an attacker can write `....//` and after the replacement the string becomes `../`, successfully bypassing the filter. The penetration tester can still traverse directories.

**Fix:** Replace the `str_replace` call with `basename($page)` at CHANGE 1. `basename()` asks the OS path parser to return only the final component of any path string, stripping every directory separator and traversal element in one step.

**Explanation:** `str_replace` operates on a flat string and only removes the exact patterns you list. An attacker controls the input and can craft strings that produce the forbidden sequence *after* your removal pass runs — `....//` minus `../` equals `../`. `basename()` does not search for patterns; it tokenizes the path by directory separators and returns the rightmost segment, so `../../../etc/passwd` becomes `passwd` and `....//foo` becomes `foo`. There is no variant of a traversal sequence that survives `basename()` because any segment boundary is consumed. The one edge case to know: `basename()` is locale-sensitive on some platforms, which is why the allowlist in CHANGE 2 is still necessary.

---

### Issue 2: No Allowlist — Arbitrary File Dispatch

**Problem:** After sanitization, the code accepts any page name, so an attacker who knows or guesses the name of any `.php` file inside `pages/` (or reachable via a symlink) can execute it. There is also no defense against future files accidentally dropped into that directory.

**Fix:** Add an explicit `$allowed` array at CHANGE 2 containing exactly the valid page names (`home`, `about`, `contact`, `404`). Any `$page` value not in that array is silently replaced with `'404'` before the file path is constructed.

**Explanation:** Sanitizing input to remove bad characters is a denylist approach; it can only block patterns you have already thought of. An allowlist inverts that: only values you have explicitly approved can proceed. If a developer later adds a `debug.php` or `phpinfo.php` to the `pages/` directory, the allowlist blocks requests to it automatically without any additional code changes. `in_array` with the third argument `true` enforces strict type comparison, preventing type-juggling edge cases where the integer `0` might match a string.

---

### Issue 3: No Canonical Path Verification Against Base Directory

**Problem:** Even with `basename()` and an allowlist, symlinks inside `pages/` could point outside it, and any future change that constructs the path differently (e.g., appending user data again) would not be caught. The code never confirms the resolved file actually lives inside the intended directory.

**Fix:** At CHANGE 3, call `realpath($file)` to get the canonical absolute path, then use `strpos` to assert that path starts with `realpath(__DIR__ . '/../pages')`. If the check fails, fall back to `404.php`.

**Explanation:** `realpath()` resolves every `..`, `.`, and symlink in a path and returns the true absolute filesystem location. Comparing that result against the known-good base directory with `strpos` is a belt-and-suspenders check: even if all earlier filters fail or are bypassed, the file the OS would actually open must be inside `pages/`. The `DIRECTORY_SEPARATOR` is appended to `$pagesDir` before the comparison so that a directory named `pages-evil` adjacent to `pages` does not match. `realpath()` returns `false` for non-existent files, so the `=== false` guard also doubles as a file-existence check, replacing the earlier `file_exists` call.
