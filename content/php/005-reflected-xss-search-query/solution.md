## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unescaped Search Term in HTML Output
// ------------------------------------------------------------------------

<?php
// search.php

require __DIR__ . '/db.php';

$q = trim($_GET['q'] ?? '');

// CHANGE 2: Escape LIKE special characters before embedding in the pattern so `%` and `_` in user input are treated as literals, not wildcards.
$safe_q = addcslashes(strip_tags($q), '%_\\');

$stmt = $pdo->prepare(
    "SELECT id, title, excerpt FROM articles
      WHERE title LIKE ? OR body LIKE ?
      LIMIT 30"
);
$pattern = '%' . $safe_q . '%';
$stmt->execute([$pattern, $pattern]);
$results = $stmt->fetchAll(PDO::FETCH_ASSOC);

?>
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Search</title></head>
<body>
<!-- CHANGE 1: Use htmlspecialchars() on the raw input when reflecting it into HTML so angle brackets, quotes, and ampersands are encoded and cannot be interpreted as markup or event handlers. -->
<h1>Results for "<?= htmlspecialchars($q, ENT_QUOTES, 'UTF-8') ?>"</h1>
<ul>
<?php foreach ($results as $row): ?>
    <li><a href="/article/<?= (int) $row['id'] ?>">
        <?= htmlspecialchars($row['title'], ENT_QUOTES, 'UTF-8') ?>
    </a></li>
<?php endforeach; ?>
</ul>
</body>
</html>
```

## Explanation

### Issue 1: Reflected XSS via unencoded output

**Problem:** The search term from `$_GET['q']` is reflected back into the HTML heading without HTML encoding. An attacker crafts a URL like `search.php?q=<script>fetch('/api/change-email',{method:'POST',...})</script>`, shares it, and any logged-in user who clicks it executes the attacker's JavaScript in their browser session — exactly what the bug report described.

**Fix:** Replace `<?= $safe_q ?>` in the `<h1>` with `<?= htmlspecialchars($q, ENT_QUOTES, 'UTF-8') ?>`. This encodes `<`, `>`, `"`, `'`, and `&` into their HTML entity equivalents before writing to the page.

**Explanation:** `strip_tags()` removes complete tag tokens like `<script>`, but it does not encode the characters that form tags. Input such as `"><img src=x onerror=alert(1)>` passes through `strip_tags()` intact because the outer `"` closes an HTML attribute rather than forming a tag itself. `htmlspecialchars()` converts every structurally significant character into an entity, so the browser renders the text literally instead of parsing it as markup. The fix uses `$q` (the raw trimmed value) in the heading because the LIKE-escape step on `$safe_q` would corrupt display of characters like `%` in the visible heading text.

---

### Issue 2: LIKE wildcard injection expands query scope

**Problem:** When a user searches for `%`, the pattern becomes `%%%`, which matches every row in the `articles` table. A search for `_` matches any single character, returning rows that share no words with the intended term. On a large table this leaks content and wastes database resources.

**Fix:** Call `addcslashes($q, '%_\\')` before building `$pattern`. This inserts a backslash before every `%`, `_`, and `\` in the user input so MySQL treats them as literal characters in the `LIKE` comparison.

**Explanation:** MySQL's `LIKE` operator reserves `%` (match any sequence) and `_` (match any single character) as metacharacters. Parameterised queries protect against SQL injection by binding values safely, but they do not escape LIKE metacharacters inside those values — that escaping must be done in application code before the value is placed in the placeholder. `addcslashes()` prepends a backslash to each listed character; MySQL's default LIKE escape character is `\`, so `foo\_bar` matches the literal string `foo_bar`. The backslash itself must also be escaped (`\\` in the `addcslashes` mask) to avoid accidentally escaping the following character when the input ends in `\`.
