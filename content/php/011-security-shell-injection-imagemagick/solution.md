## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Shell Injection via Filename
// ------------------------------------------------------------------------

<?php
// upload/resize.php

$uploadDir = '/var/www/html/uploads/';
$thumbDir  = '/var/www/html/uploads/thumbs/';

if ($_FILES['image']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    exit('Upload error');
}

// CHANGE 2: Validate that the uploaded file is actually a JPEG/PNG/GIF before saving; any other MIME type is rejected to prevent storing executable files in the web root.
$allowedMimes = ['image/jpeg', 'image/png', 'image/gif'];
$detectedMime = mime_content_type($_FILES['image']['tmp_name']);
if (!in_array($detectedMime, $allowedMimes, true)) {
    http_response_code(415);
    exit('Unsupported file type');
}

$originalName = basename($_FILES['image']['name']);
$destination  = $uploadDir . $originalName;

// CHANGE 3: Check the return value of move_uploaded_file and abort with an error response if it fails, so ImageMagick is never invoked against a missing or wrong path.
if (!move_uploaded_file($_FILES['image']['tmp_name'], $destination)) {
    http_response_code(500);
    exit('Failed to save uploaded file');
}

$thumb = $thumbDir . $originalName;

// CHANGE 1: Wrap both file paths with escapeshellarg() so that any shell metacharacters in the filename are quoted and treated as literal characters by the shell, preventing injection.
$cmd    = 'convert ' . escapeshellarg($destination) . ' -resize 200x200 ' . escapeshellarg($thumb);
$output = shell_exec($cmd);

echo json_encode(['thumb' => '/uploads/thumbs/' . $originalName]);
```

## Explanation

### Issue 1: Shell Injection via Filename

**Problem:** A seller uploads a file whose name contains shell metacharacters such as `;`, `&&`, or backticks. Because `$destination` and `$thumb` are concatenated directly into the string passed to `shell_exec`, the shell interprets those characters as command separators and executes the attacker-supplied commands with the web server's user permissions. The reported case — `product; rm -rf /var/www/html/uploads;.jpg` — deleted the entire uploads directory.

**Fix:** Both `$destination` and `$thumb` are wrapped with `escapeshellarg()` before being concatenated into `$cmd`, turning the raw variables into single-quoted shell strings where metacharacters are escaped.

**Explanation:** `shell_exec` passes the command string to `/bin/sh -c`. Without quoting, a filename like `a; id > /tmp/out` becomes two separate shell commands: `convert a` and `id > /tmp/out`. `escapeshellarg()` wraps the value in single quotes and escapes any embedded single quotes, so the shell sees the entire filename as one argument with no special meaning for semicolons, backticks, `$()`, or pipes. One related pitfall: `escapeshellcmd()` is the wrong function here — it escapes the whole command string and still allows argument injection via whitespace-separated tokens. Always use `escapeshellarg()` on individual arguments.

---

### Issue 2: No File-Type Validation

**Problem:** The script accepts any file the browser sends and writes it to `/var/www/html/uploads/`, which is directly web-accessible. An attacker can upload a `.php` file disguised with an image-like name; once saved, they request it via HTTP and the server executes it as PHP, giving full shell access.

**Fix:** `mime_content_type()` is called on the temporary file path (not the client-supplied name) to detect the actual file content, and the request is rejected with HTTP 415 if the MIME type is not in the `$allowedMimes` allowlist.

**Explanation:** Browser-supplied `$_FILES['image']['type']` is trivially forged via any HTTP client, so it cannot be trusted. `mime_content_type()` inspects the file's actual bytes (magic bytes), making it much harder to lie about file content. Checking the extension alone is also insufficient because many web servers serve files based on content or because attackers can upload `.php5`, `.phtml`, or other variants. A secondary hardening measure not shown here is to add an `X-Content-Type-Options: nosniff` header and configure the uploads directory with `php_flag engine off` so PHP is never interpreted there, providing defence in depth.

---

### Issue 3: Unchecked move_uploaded_file Return Value

**Problem:** `move_uploaded_file` returns `false` if the destination directory does not exist, is not writable, or if the uploaded file handle is invalid. When it fails silently, `$destination` points to a path that does not exist, ImageMagick is invoked against it anyway, and the caller receives a JSON response implying success even though no thumbnail was created.

**Fix:** The return value of `move_uploaded_file` is captured in a conditional; if it is `false`, the script responds with HTTP 500 and exits before reaching the `shell_exec` call.

**Explanation:** PHP functions that interact with the filesystem frequently signal failure via a `false` return rather than throwing an exception. Ignoring the return value means errors are invisible: the seller sees a success response, no thumbnail appears, and logs may show an ImageMagick error that looks unrelated. Checking the return value immediately makes failures visible, stops downstream commands from running against a bad state, and gives the caller an accurate HTTP status code to act on.
