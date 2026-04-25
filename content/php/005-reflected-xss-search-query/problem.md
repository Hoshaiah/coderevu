---
slug: reflected-xss-search-query
track: php
orderIndex: 5
title: Unescaped Search Term in HTML Output
difficulty: easy
tags:
  - security
  - xss
  - output-encoding
language: php
---

## Context

This snippet is from `search.php`, the site-wide search results page of a content portal. It takes a `q` query string parameter, runs a LIKE query against the articles table, and renders results. The page also echoes the original search term back to the user as a friendly heading: *Results for "your search"*.

A bug report from a user contained a suspicious URL shared in the company Slack. When clicked by a colleague who was logged in, it silently made an API call to change the colleague's email address. The security team traced it back to the `q` parameter being reflected into the page without encoding.

The developer had used `strip_tags()` on the query before the database search, believing that was sufficient. `strip_tags()` removes HTML tags but leaves attribute-injectable characters like `"` and `'` intact, and it does not help when the value is reflected inside a JavaScript event handler or an HTML attribute.

## Buggy code

```php
<?php
// search.php

require __DIR__ . '/db.php';

$q = trim($_GET['q'] ?? '');

// Used for the DB query (strip_tags "cleans" it, developer thought)
$safe_q = strip_tags($q);

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
<h1>Results for "<?= $safe_q ?>"</h1>
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
