## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Missing Ownership Check on Invoice Download
// ------------------------------------------------------------------------

<?php
// invoices/download.php

require __DIR__ . '/../session.php'; // asserts $_SESSION['user_id'] exists
require __DIR__ . '/../db.php';      // provides $pdo

$invoice_id = (int) ($_GET['id'] ?? 0);

if ($invoice_id <= 0) {
    http_response_code(400);
    exit('Invalid invoice ID.');
}

// CHANGE 1: Added `AND user_id = ?` so the query only matches invoices owned by the current session user, preventing horizontal privilege escalation.
$stmt = $pdo->prepare(
    "SELECT file_path, filename FROM invoices WHERE id = ? AND user_id = ?"
);
$stmt->execute([$invoice_id, $_SESSION['user_id']]);
$invoice = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$invoice) {
    http_response_code(404);
    exit('Invoice not found.');
}

$storage_dir = realpath(__DIR__ . '/../storage');
$path        = realpath($storage_dir . '/' . $invoice['file_path']);

// CHANGE 2: Verify the resolved path starts with the storage directory to prevent a poisoned file_path value from escaping the intended directory via "../" sequences or symlinks.
if ($path === false || strpos($path, $storage_dir . DIRECTORY_SEPARATOR) !== 0) {
    http_response_code(403);
    exit('Access denied.');
}

header('Content-Type: application/pdf');
header('Content-Disposition: attachment; filename="' . $invoice['filename'] . '"');
readfile($path);
```

## Explanation

### Issue 1: Missing Ownership Check on Invoice Fetch

**Problem:** The SQL query fetches an invoice row using only the `id` column. Any logged-in user who guesses or increments an integer `id` value in the URL receives another customer's PDF. Authentication confirms the request comes from *a* valid user, but nothing confirms the invoice belongs to *that* user.

**Fix:** The `SELECT` statement gains a second condition, `AND user_id = ?`, and `$_SESSION['user_id']` is added as the second bound parameter in `$stmt->execute([$invoice_id, $_SESSION['user_id']])`. The database now returns a row only when both the invoice ID and the owner match.

**Explanation:** The bug is that authentication and authorisation are conflated. The session check proves identity; it says nothing about resource ownership. Because invoice IDs are sequential integers, an attacker needs no special knowledge — a simple loop from 1 to some large number downloads every invoice in the system. Adding `AND user_id = ?` pushes the ownership decision into the database, so a mismatched user ID causes `fetch()` to return `false` and the endpoint returns 404. A related pitfall: returning 403 instead of 404 on a mismatch leaks the fact that the invoice exists; returning 404 uniformly avoids that information disclosure.

---

### Issue 2: Path Traversal via Unsanitised `file_path` Value

**Problem:** `$invoice['file_path']` is concatenated directly into a filesystem path and passed to `readfile()`. If that column ever contains a value like `../../etc/passwd` or a symlink that escapes the storage directory — whether through a bug elsewhere, a migration script, or a compromised admin interface — the endpoint serves arbitrary files from the server.

**Fix:** `realpath()` is called on both the storage directory and the constructed file path, then `strpos()` confirms the resolved file path starts with the resolved storage directory. If the check fails, the request is rejected with a 403 before `readfile()` is called.

**Explanation:** `realpath()` resolves all `../` components and symlinks, producing an absolute canonical path. Comparing the result against the known storage directory base catches any attempt to escape the intended location regardless of how the traversal is encoded. The check uses `$storage_dir . DIRECTORY_SEPARATOR` (with the trailing separator) rather than just `$storage_dir` to prevent a path like `/var/storage-extra/secret.pdf` from falsely matching a storage dir of `/var/storage`. This is a defence-in-depth measure: if `file_path` values in the database are always trustworthy, the check costs almost nothing; if they are ever corrupted, the check stops arbitrary file reads.
