---
slug: security-unescaped-html-output-profile
track: php
orderIndex: 9
title: Unescaped User HTML in Profile
difficulty: easy
tags:
  - security
  - xss
  - output-encoding
language: php
---

## Context

This is `public/profile.php`, the public-facing user profile page in a social platform. It fetches the target user's bio and display name from MySQL and renders them directly into the page. The page is linked from search results and user directories — any logged-in or anonymous visitor can view it.

Support started receiving reports that visiting certain user profiles triggers unexpected redirects or shows popup alerts. One report mentioned their session cookie was stolen after clicking a profile link in the forums. The security team suspects something on the profile page.

A junior developer reviewed the file and said "the data comes from the database so it's already safe" — but that reasoning is wrong. The content was stored without sanitization at registration time.

## Buggy code

```php
<?php
// public/profile.php

require_once __DIR__ . '/../src/db.php';

$userId = (int) $_GET['id'];

$stmt = $pdo->prepare("SELECT display_name, bio, avatar_url FROM users WHERE id = ?");
$stmt->execute([$userId]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$user) {
    http_response_code(404);
    echo "User not found";
    exit;
}
?>
<!DOCTYPE html>
<html>
<head><title>Profile</title></head>
<body>
  <h1><?php echo $user['display_name']; ?></h1>
  <img src="<?php echo $user['avatar_url']; ?>" alt="avatar">
  <p><?php echo $user['bio']; ?></p>
</body>
</html>
```
