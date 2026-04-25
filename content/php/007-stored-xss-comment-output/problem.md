---
slug: stored-xss-comment-output
track: php
orderIndex: 7
title: Unescaped Comment HTML Output
difficulty: easy
tags:
  - security
  - xss
  - output-encoding
language: php
---

## Context

The file `public/blog/post.php` renders a blog post and its associated reader comments from a MySQL database. Comments are submitted through a separate `comment_submit.php` endpoint that inserts rows into a `comments` table after stripping a small blocklist of words. The site runs PHP 8.1 with PDO and no templating engine — raw `echo` calls build the HTML.

The security team received a report that visiting any popular post causes an unexpected redirect for some users. Inspecting the network tab shows a `<script>` tag inside the comments section that reads `document.location`. A prior developer claimed the word-blocklist on submission "handles XSS," but the blocklist only strips the literal string `<script>` and leaves everything else intact.

Dynamic output in the post body itself was already identified as safe — it is passed through `htmlspecialchars`. The comments loop is the only place where raw database values are echoed.

## Buggy code

```php
<?php
// public/blog/post.php

require_once __DIR__ . '/../../bootstrap.php';

$pdo = get_db_connection();
$post_id = (int) ($_GET['id'] ?? 0);

$stmt = $pdo->prepare("SELECT title, body FROM posts WHERE id = ?");
$stmt->execute([$post_id]);
$post = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$post) {
    http_response_code(404);
    echo "Post not found.";
    exit;
}

$stmt2 = $pdo->prepare(
    "SELECT author, body FROM comments WHERE post_id = ? ORDER BY created_at ASC"
);
$stmt2->execute([$post_id]);
$comments = $stmt2->fetchAll(PDO::FETCH_ASSOC);

echo "<h1>" . htmlspecialchars($post['title'], ENT_QUOTES, 'UTF-8') . "</h1>";
echo "<div class='post-body'>" . htmlspecialchars($post['body'], ENT_QUOTES, 'UTF-8') . "</div>";

echo "<h2>Comments</h2>";
foreach ($comments as $comment) {
    echo "<div class='comment'>";
    echo "<strong>" . $comment['author'] . "</strong>";
    echo "<p>" . $comment['body'] . "</p>";
    echo "</div>";
}
```
