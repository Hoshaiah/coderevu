## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Avatar upload endpoint checks only MIME type from the request, allowing PHP webshell upload
// ------------------------------------------------------------------------
<?php
// api/upload_avatar.php

session_start();
if (empty($_SESSION['user_id'])) {
    http_response_code(401);
    exit;
}

$userId  = (int) $_SESSION['user_id'];
$upload  = $_FILES['avatar'] ?? null;

if (!$upload || $upload['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'Upload failed']);
    exit;
}

// CHANGE 3: Enforce a maximum file size (2 MB) before doing anything else.
$maxBytes = 2 * 1024 * 1024;
if ($upload['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['error' => 'File too large']);
    exit;
}

$allowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// CHANGE 1: Use finfo to detect the real MIME type from the file bytes on disk instead of trusting the browser-supplied $_FILES['type'] value.
$finfo      = new finfo(FILEINFO_MIME_TYPE);
$serverMime = $finfo->file($upload['tmp_name']);

if (!in_array($serverMime, $allowedMime)) {
    http_response_code(415);
    echo json_encode(['error' => 'Unsupported image type']);
    exit;
}

// CHANGE 2: Derive the extension from the server-verified MIME type rather than from the original filename, preventing a .php (or any executable) extension from being preserved.
$mimeToExt = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
];
$ext      = $mimeToExt[$serverMime];
$filename = "avatar_{$userId}.{$ext}";
$dest     = __DIR__ . '/../public/avatars/' . $filename;

// CHANGE 4: Check the return value of move_uploaded_file and return an error response if the move fails instead of silently serving a broken URL.
if (!move_uploaded_file($upload['tmp_name'], $dest)) {
    http_response_code(500);
    echo json_encode(['error' => 'Could not save file']);
    exit;
}

echo json_encode(['url' => "/avatars/{$filename}"]);
```

## Explanation

### Issue 1: Trusted client-supplied MIME type

**Problem:** The code reads the file's MIME type from `$_FILES['avatar']['type']`, which is whatever the HTTP client puts in the `Content-Type` field of the multipart form body. An attacker sets that header to `image/jpeg` while uploading a file that contains PHP code. The check passes, the file is saved, and the server executes it when a browser requests its URL.

**Fix:** Replace the `$upload['type']` read with a call to `finfo->file($upload['tmp_name'])` using `FILEINFO_MIME_TYPE`. The MIME type is now detected by inspecting the actual bytes of the temporary file on disk, not the client header.

**Explanation:** PHP's `finfo` extension reads magic bytes at the start of the file to determine its real format — the same approach `file(1)` uses on Linux. A PHP script does not begin with a JPEG SOI marker (`0xFF 0xD8`), so `finfo` returns something other than `image/jpeg` and the upload is rejected. The client has no way to influence what `finfo` reads because it inspects the temp file the web server already wrote, not anything from the request headers. One pitfall: a valid JPEG with PHP code appended in a comment can still pass `finfo` — but that code cannot be executed as long as the extension is also fixed (see Issue 2).

---

### Issue 2: File extension inherited from attacker-controlled filename

**Problem:** The extension saved to disk comes from `pathinfo($upload['name'], PATHINFO_EXTENSION)`, where `$upload['name']` is the original filename the client sent. An attacker uploads a file named `shell.php`; even after the MIME check passes (legitimately or via the spoofing bug above), the file lands on disk as `avatar_7.php` in the public directory. Apache or Nginx then executes it on request.

**Fix:** Replace `pathinfo($upload['name'], PATHINFO_EXTENSION)` with a lookup in a `$mimeToExt` map keyed by the server-verified MIME type. The extension now comes entirely from server-controlled data.

**Explanation:** The web server uses the file extension, not MIME type metadata on disk, to decide whether to execute a file. Saving as `.php` means `mod_php` or `php-fpm` will run the file when it is requested via HTTP regardless of its content. By deriving the extension from the MIME the server detected, the extension is always one of `jpg`, `png`, `gif`, or `webp` — none of which any standard PHP handler will execute. A related pitfall: some Apache configs execute `.phtml`, `.php5`, or other variants, so the allowlist should be kept narrow.

---

### Issue 3: No file size limit

**Problem:** The endpoint accepts uploads of any size. An attacker repeatedly sends large payloads to fill the server's disk, which can take the web server or database offline when the filesystem hits capacity.

**Fix:** Add a check immediately after verifying `UPLOAD_ERR_OK` that compares `$upload['size']` against a `$maxBytes` constant (set to 2 MB in the reference solution) and returns HTTP 413 if the size is exceeded.

**Explanation:** PHP's `upload_max_filesize` and `post_max_size` INI settings provide a coarse limit, but they are often set generously and may be overridden by server configuration the application does not control. An explicit in-code check gives the application a guaranteed upper bound regardless of server config. Checking `$upload['size']` is safe because PHP populates this from the actual bytes received, not from a client-supplied header. For avatar images 2 MB is generous; realistic constraints are tighter.

---

### Issue 4: Return value of move_uploaded_file ignored

**Problem:** If `move_uploaded_file` fails — because of a permissions error, a full disk, or a misconfigured upload directory — the code continues and returns a 200 response with a URL that points to a file that does not exist. The caller has no way to know the upload failed.

**Fix:** Wrap `move_uploaded_file` in an `if (!...)` check. On failure, return HTTP 500 with a JSON error body and `exit`, instead of falling through to the success response.

**Explanation:** `move_uploaded_file` returns `false` on failure but does not throw an exception, so silent fall-through is easy to overlook. The symptom is a client that believes the upload succeeded, stores the returned URL, and later shows a broken image. In security terms the failure is less severe than the other issues, but ignoring return values from filesystem operations is a general reliability hazard. Logging the failure (not shown here to keep the diff minimal) would also help operators diagnose permission or quota problems.
