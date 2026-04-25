## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Header Injection via Filename
// ------------------------------------------------------------------------

<?php
// src/Reports/DownloadController.php

require_once __DIR__ . '/../../bootstrap.php';

session_start();

$user_id = $_SESSION['user_id'] ?? null;
if (!$user_id) {
    http_response_code(401);
    exit;
}

$report_id = (int) ($_GET['report_id'] ?? 0);

$pdo  = get_db_connection();
$stmt = $pdo->prepare(
    "SELECT name, file_path FROM reports WHERE id = ? AND user_id = ?"
);
$stmt->execute([$report_id, $user_id]);
$report = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$report) {
    http_response_code(404);
    echo 'Report not found';
    exit;
}

$report_name = $report['name'];
$file_path   = $report['file_path'];

// CHANGE 1: Strip all CR, LF, and NUL characters from the filename to prevent CRLF header injection — any of these bytes would let an attacker terminate the header line and inject new headers.
$safe_name = str_replace(["\r", "\n", "\0"], '', $report_name);

// CHANGE 2: Remove double-quote characters from the filename so they cannot escape the quoted-string boundary in the Content-Disposition value and corrupt the header structure.
$safe_name = str_replace('"', '', $safe_name);

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $safe_name . '"');

readfile($file_path);
exit;
```

## Explanation

### Issue 1: CRLF injection via report filename

**Problem:** The raw `$report_name` string fetched from the database is placed directly into the `Content-Disposition` header value. If the name contains `\r\n` (carriage-return + line-feed), PHP's `header()` treats those bytes as the end of the current header line and the start of a new one. An attacker who controls the report name can therefore write any header — such as `Set-Cookie: session=attacker_value` — into the response received by any user who downloads the report.

**Fix:** `CHANGE 1` adds a `str_replace` call that removes `\r`, `\n`, and `\0` from `$report_name` before it is used in the header string, storing the result in `$safe_name`. The `header()` call then uses `$safe_name` instead of the raw value.

**Explanation:** HTTP headers are delimited by `\r\n`. When `header()` receives a string containing those bytes, PHP (before 7.4 hardened this) or certain SAPI configurations will split the string and emit each segment as a separate header line. The attacker crafts a report name like `report\r\nSet-Cookie: session=evil`, which causes the server to emit both the intended `Content-Disposition` header and the injected `Set-Cookie` header. Stripping `\r` and `\n` before interpolation means there is no byte sequence that can prematurely end the header line. `\0` is included because some HTTP stacks treat a NUL byte as a line terminator as well. Note that PHP 7.4+ raises an error on `\r\n` in `header()`, but stripping is still the correct defense because it covers older PHP versions and alternative SAPI behaviors.

---

### Issue 2: Double-quote characters break the quoted-string boundary

**Problem:** The filename is placed inside a quoted string in the header: `filename="<value>"`. If the report name contains a literal `"` character, it closes the quoted string early and leaves trailing content outside it, producing a malformed header value. Depending on the browser or proxy, this can cause unexpected parsing behavior or be combined with other characters to further manipulate the header.

**Fix:** `CHANGE 2` adds a second `str_replace` call that removes all `"` characters from `$safe_name` before it is interpolated into the `Content-Disposition` value. This ensures the quoted-string is always properly bounded.

**Explanation:** RFC 6266 defines the `filename` parameter as a quoted-string, where the closing `"` marks the end of the value. A filename like `my"report.pdf` produces `filename="my"report.pdf"`, which parsers interpret inconsistently — some stop at the second `"`, discarding `report.pdf"`, while others treat the remainder as another parameter. Removing `"` from the filename keeps the header syntactically valid. A more thorough alternative is to percent-encode or backslash-escape special characters using the `filename*` RFC 5987 encoding, but for most use cases simply stripping `"` and the CRLF bytes is a minimal, correct fix that avoids introducing encoding bugs.
