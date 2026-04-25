## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — XSS via Unsanitized content_tag
# ------------------------------------------------------------------------

module NotificationsHelper
  def render_notification(notification)
    return unless notification

    content_tag(:div, class: "notification-banner #{notification.severity}") do
      content_tag(:h4, notification.title) +
      # CHANGE 1: Removed `.html_safe` so Rails escapes HTML entities in the body before rendering, preventing XSS from attacker-controlled body content.
      content_tag(:p, notification.body)
    end
  end

  def notification_icon(severity)
    icons = { info: "ℹ", warning: "⚠", error: "✖" }
    # CHANGE 2: Removed `.html_safe` from a static hash of Unicode strings; `content_tag` will escape them safely and no trust escalation is needed here.
    icons[severity.to_sym]
  end
end
```

## Explanation

### Issue 1: Unsanitized `html_safe` on user-supplied body

**Problem:** Any admin (or attacker with admin access) can store an HTML payload like `<img src=x onerror=alert(document.cookie)>` in `notification.body`. When the dashboard loads, that script executes in every user's browser, leaking session cookies or performing actions as the victim.

**Fix:** Remove `.html_safe` from `notification.body` in the `content_tag(:p, ...)` call. With that call gone, Rails treats the string as untrusted, HTML-encodes every `<`, `>`, `&`, and `"` character, and the browser renders them as visible text instead of markup.

**Explanation:** Rails strings are "unsafe" by default, meaning `ERB::Util.html_escape` runs before they are written into the DOM. Calling `.html_safe` on a string sets an internal flag that tells Rails "trust this, skip escaping". When `content_tag` receives an `html_safe` string as its block content, it inserts it verbatim. The developer's assumption that `content_tag` always escapes block content is wrong — it only escapes the *attribute values* it builds itself (e.g., `class`), not a string that already carries the safe flag. Removing `.html_safe` restores the default escaping path: Rails calls `h(notification.body)` internally and the injected angle brackets become `&lt;img ...&gt;`, which is inert. If the product ever needs to allow a safe subset of HTML in notifications, use a library like `rails_autolink` or `ActionView::Helpers::SanitizeHelper#sanitize` with an explicit allowlist rather than marking the raw value safe.

---

### Issue 2: Gratuitous `html_safe` on static icon strings

**Problem:** The icon characters (ℹ, ⚠, ✖) are hardcoded Unicode literals, so there is no immediate injection risk. However, marking them `html_safe` is an unnecessary pattern: if someone later changes the hash to pull values from a database or config file, the `html_safe` call will silently suppress escaping on that new, possibly attacker-influenced data.

**Fix:** Remove `.html_safe` from the return value of `notification_icon`. `content_tag` (or any ERB context) will escape the Unicode glyphs correctly without the flag, and the rendered output is identical because those characters have no HTML-special meaning.

**Explanation:** Unicode characters like ℹ and ⚠ do not contain `<`, `>`, `&`, or `"`, so escaping them produces the same bytes. The `html_safe` call is doing nothing useful today, but it is dangerous as a precedent. A future developer sees the pattern, copies it for a new icon source that does include user data, and re-introduces an XSS vector. Keeping the codebase free of unnecessary `html_safe` calls makes audits easier: every remaining `.html_safe` in the project is a deliberate, justified trust decision rather than a habit. The fix is simply deleting the method call; the return value of `icons[severity.to_sym]` is a plain Ruby String, which any Rails rendering helper will escape by default.
