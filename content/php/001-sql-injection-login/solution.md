## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Login endpoint concatenates raw input into SQL
// ------------------------------------------------------------------------
<?php
// admin/login.php

session_start();
$conn = mysqli_connect("localhost", "app", "password", "app_db");

$username = $_POST["username"];
$password = $_POST["password"];

// CHANGE 1: Use a prepared statement with a bound parameter instead of concatenating $username into the query string directly. This prevents SQL injection regardless of what characters the input contains.
$stmt = mysqli_prepare($conn, "SELECT id, password_hash FROM admins WHERE username = ?");
mysqli_stmt_bind_param($stmt, "s", $username);
mysqli_stmt_execute($stmt);
$result = mysqli_stmt_get_result($stmt);

// CHANGE 3: Check that a row was actually returned before accessing its fields. mysqli_fetch_assoc returns false when no rows exist; comparing md5() against false is misleading and error-prone.
$row = mysqli_fetch_assoc($result);

if ($row && // CHANGE 2: Replace md5() with password_verify(), which is designed
           // for password comparison and works with bcrypt/argon2 hashes stored
           // at signup. MD5 is not a password hash — it has no salt and can be
           // reversed with lookup tables in seconds.
    password_verify($password, $row["password_hash"])) {

    // CHANGE 4: Regenerate the session ID after a successful login to prevent session fixation attacks where an attacker pre-sets a known session ID.
    session_regenerate_id(true);

    $_SESSION["admin_id"] = $row["id"];
    header("Location: /admin/dashboard.php");
    exit;
}

echo "Login failed";
```

## Explanation

### Issue 1: SQL Injection via Raw POST Input

**Problem:** The query string is built by dropping `$_POST['username']` straight into a double-quoted string. An attacker submits a username like `' OR '1'='1` and the resulting SQL becomes `WHERE username = '' OR '1'='1'`, which matches every row and hands them the first admin account without a valid password.

**Fix:** Replace the string-concatenation query with `mysqli_prepare()` using a `?` placeholder, then bind `$username` via `mysqli_stmt_bind_param()`. The raw input never touches the SQL grammar layer.

**Explanation:** The MySQL driver treats bound parameters as data, not SQL syntax. No matter what characters `$username` contains — quotes, comment markers, semicolons — they cannot alter the structure of the query. `addslashes()` at signup time is irrelevant here: it only affects the value stored in the database, not what the attacker sends to the login form. A prepared statement closes the hole permanently because the query plan is compiled before any user data is inserted.

---

### Issue 2: MD5 Used for Password Verification

**Problem:** `md5($password)` produces an unsalted 128-bit hash. An attacker who obtains the `admins` table (perhaps via the SQL injection above) can crack every password in minutes using a GPU and a precomputed rainbow table, because MD5 is designed to be fast, not resistant to brute force.

**Fix:** Replace `md5($password) === $row['password_hash']` with `password_verify($password, $row['password_hash'])`. This works with bcrypt or argon2 hashes produced by `password_hash()` at registration time.

**Explanation:** `password_verify()` uses a constant-time comparison and understands the hash algorithm and per-password salt that `password_hash()` embedded in the stored string. MD5 has none of those properties: it runs in nanoseconds, its output is a fixed-length hex string with no salt, and billions of common-password hashes are publicly indexed. Switching to `password_verify()` requires that signup also use `password_hash()` — if the legacy table stores MD5 hashes, a forced-reset migration is necessary.

---

### Issue 3: No Guard Against a Missing Row

**Problem:** When no admin matches the username, `mysqli_fetch_assoc()` returns `false`. The code then evaluates `$row && md5(...) === $row['password_hash']`; PHP short-circuits on `false`, so no crash occurs today, but if the condition were restructured even slightly it would try to read a key from `false`, producing a fatal error or a PHP notice depending on the error level.

**Fix:** The explicit `$row &&` check is preserved in the reference solution and called out at CHANGE 3 so its purpose is clear. The surrounding code is also tightened so no array access happens unless `$row` is a valid associative array.

**Explanation:** Defensive existence checks make the login logic resilient to future edits. A developer later adding a "remember me" feature might move the `password_verify` call outside the conditional and unknowingly introduce a null-dereference. Making the guard explicit documents the intent. It also prevents timing-based username enumeration: if you add an `else` that returns quickly for missing users versus running a hash comparison for valid ones, attackers can distinguish the two cases by response time — keeping the flow uniform mitigates that.

---

### Issue 4: Session Fixation After Login

**Problem:** After a successful login the session ID stays the same as it was before authentication. An attacker who can set a victim's session cookie (via a shared network, XSS on another page, or a subdomain cookie injection) plants a known ID, waits for the victim to log in, and then uses that same ID to access the admin dashboard.

**Fix:** Call `session_regenerate_id(true)` immediately after the credentials pass and before writing `$_SESSION['admin_id']`. The `true` argument deletes the old session file on the server.

**Explanation:** `session_start()` at the top of the page either resumes an existing session or creates a new one. Either way, the ID is known to the client before authentication happens. Regenerating the ID at the privilege-elevation point (the moment the user becomes an admin) means any previously planted ID is invalidated. The old session data is deleted (`true` flag) so there is no window where both the old and new IDs grant access. This is especially important for admin endpoints because the blast radius of a hijacked session is total.
