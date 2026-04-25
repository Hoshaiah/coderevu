## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — UTF-8 Truncation Corrupts Stored Data
// ------------------------------------------------------------------------

<?php
// src/Repository/UserRepository.php

class UserRepository
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function updateEmail(int $userId, string $email): bool
    {
        // CHANGE 2: Use mb_strlen with encoding to count characters, but also guard on byte length — MySQL utf8 columns are capped at 255 bytes, not 255 characters, so a purely character-count check allows oversized strings through.
        if (mb_strlen($email, 'UTF-8') > 255 || strlen($email) > 255) {
            throw new \InvalidArgumentException('Email too long');
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('Invalid email format');
        }

        // CHANGE 1: Set the connection charset to utf8mb4 before executing so MySQL stores 4-byte code points correctly instead of silently truncating them at the 3-byte utf8 boundary.
        $this->pdo->exec("SET NAMES utf8mb4");

        $stmt = $this->pdo->prepare(
            "UPDATE users SET email = ? WHERE id = ?"
        );
        return $stmt->execute([$email, $userId]);
    }
}
```

## Explanation

### Issue 1: MySQL `utf8` Truncates 4-Byte Characters

**Problem:** MySQL's `utf8` charset only supports code points that encode to 3 bytes or fewer (U+0000–U+FFFF). When the application sends a string containing emoji or CJK Extension-B characters — which require 4 bytes in UTF-8 — MySQL silently drops everything from the first 4-byte character onward, or rejects the row entirely depending on `sql_mode`. Users see their email address cut off at whatever character triggered the limit.

**Fix:** `$this->pdo->exec("SET NAMES utf8mb4")` is added before the `prepare` call. This tells the MySQL connection layer to use `utf8mb4`, which supports the full Unicode range including 4-byte code points. The column declaration in MySQL should also be migrated from `utf8` to `utf8mb4`, but the `SET NAMES` call ensures the client and server agree on encoding immediately.

**Explanation:** MySQL's `utf8` is a legacy alias for a 3-byte-only encoding. It predates the need for 4-byte characters and was never updated. `utf8mb4` is the correct implementation of UTF-8. Without `SET NAMES utf8mb4`, PDO sends data as `utf8mb4` bytes but tells MySQL to interpret them as 3-byte `utf8`, so MySQL sees malformed sequences and truncates at the bad byte. Setting `utf8mb4` on the connection makes MySQL accept and store the full byte sequence. Note that `SET NAMES` alone is not sufficient long-term — the column, table, and database charsets should also be `utf8mb4`, otherwise MySQL may still coerce data during storage.

---

### Issue 2: Byte-Length Guard Missing from Validation

**Problem:** The original guard calls `mb_strlen($email)`, which counts Unicode code points. A 200-character string where each character is a 4-byte emoji is 800 bytes long. MySQL's `VARCHAR(255)` limit is 255 *bytes* in a byte-oriented charset, so the character-count check passes while the actual stored value would overflow the column. The user's email gets stored truncated or the INSERT fails silently.

**Fix:** The condition is changed to `mb_strlen($email, 'UTF-8') > 255 || strlen($email) > 255`. The `strlen` call measures raw byte length in PHP (since PHP strings are byte strings), catching strings whose byte representation exceeds 255 even when the character count does not.

**Explanation:** `mb_strlen` without an explicit encoding argument uses `mbstring.internal_encoding` from `php.ini`, which may not be UTF-8 on all hosts — passing `'UTF-8'` explicitly removes that ambiguity. `strlen` returns the number of bytes in the string, which is what MySQL counts against the `VARCHAR(255)` limit. A valid email address in practice will not exceed 254 ASCII characters (per RFC 5321), but the display name or internationalised domain label could include multi-byte characters, making the byte guard important. Both checks are needed: the character check catches extremely long Unicode strings that happen to be short in bytes, and the byte check catches shorter strings whose characters are wide.
