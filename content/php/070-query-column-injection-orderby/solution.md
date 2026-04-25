## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — SQL Injection via ORDER BY Column
// ------------------------------------------------------------------------

<?php
// api/reports/transactions.php

session_start();
if (empty($_SESSION['merchant_id'])) {
    http_response_code(401); exit;
}

$conn = new PDO('mysql:host=localhost;dbname=payments', 'app', 'secret');
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$merchantId = (int) $_SESSION['merchant_id'];
$page       = max(1, (int) ($_GET['page'] ?? 1));
$offset     = ($page - 1) * 50;

// CHANGE 1: Replace regex-strip with an explicit allowlist of permitted column names so only known, safe identifiers can reach the query; any unrecognised value falls back to the safe default 'created_at'.
$allowedSortColumns = ['id', 'amount', 'status', 'created_at'];
$sortByInput        = $_GET['sort_by'] ?? 'created_at';
// CHANGE 2: Use in_array strict-match against the allowlist and fall back to 'created_at' when the input is not in the list, eliminating attacker-controlled column names entirely.
$sortBy  = in_array($sortByInput, $allowedSortColumns, true) ? $sortByInput : 'created_at';
$sortDir = strtoupper($_GET['sort_dir'] ?? 'DESC') === 'ASC' ? 'ASC' : 'DESC';

$sql = "SELECT id, amount, status, created_at
        FROM transactions
        WHERE merchant_id = :mid
        ORDER BY $sortBy $sortDir
        LIMIT 50 OFFSET :offset";

$stmt = $conn->prepare($sql);
$stmt->execute([':mid' => $merchantId, ':offset' => $offset]);

echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
```

## Explanation

### Issue 1: Regex strip insufficient as allowlist

**Problem:** `preg_replace('/[^a-zA-Z0-9_]/', '', ...)` removes punctuation and spaces but leaves alphanumeric strings untouched. An attacker can send `sort_by=1` and MySQL interprets `ORDER BY 1` as "order by the first selected column". More dangerously, `sort_by=id FROM transactions UNION SELECT ...` survives the regex because it only contains alphanumeric characters and underscores (spaces are stripped, but MySQL's parser is often forgiving about missing whitespace, and the attacker can iterate).

**Fix:** The `$allowedSortColumns` array at CHANGE 1 lists every column name the endpoint is permitted to sort by. The `in_array` check at CHANGE 2 replaces the regex, so only `id`, `amount`, `status`, or `created_at` can ever appear in the `ORDER BY` clause.

**Explanation:** SQL injection via `ORDER BY` is possible because prepared statements cannot parameterise identifiers — only values. The regex approach tries to reduce the attack surface by removing "dangerous" characters, but it reasons about what to block rather than what to allow. An allowlist inverts the logic: it defines the complete set of valid inputs and rejects everything else. With `in_array($input, $allowedSortColumns, true)`, the third argument `true` enforces strict type comparison, so a value like `0` (which PHP would coerce to match many strings in loose comparison) is correctly rejected. The only strings that reach the query are ones the developer explicitly approved.

---

### Issue 2: No safe fallback for unrecognised sort column

**Problem:** In the original code, if `sort_by` is absent or becomes an empty string after the regex strips all its characters, the query becomes `ORDER BY  DESC` (empty identifier), which causes a MySQL syntax error and a 500 response leaking exception details. There is no controlled default path.

**Fix:** The ternary at CHANGE 2 evaluates to `'created_at'` when `$sortByInput` is not in the allowlist, so every code path produces a valid, developer-chosen column name before it reaches the query string.

**Explanation:** Defensive code should have a safe default for every invalid input, not just block the invalid input and let execution continue with a broken value. Here, an empty `$sortBy` would produce a malformed SQL string that PDO still sends to MySQL, causing an unhandled exception. By assigning `'created_at'` as the fallback inside the same expression that does the allowlist check, the two concerns — validation and defaulting — are handled together and cannot drift apart. A related pitfall: if the fallback were placed in a separate `if` block later in the file, a future developer could inadvertently insert code between them that uses the still-invalid `$sortBy`.
