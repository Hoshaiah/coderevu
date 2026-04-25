## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — PREG_REPLACE e-Modifier Code Execution
// ------------------------------------------------------------------------

<?php
// lib/TemplateRenderer.php

class TemplateRenderer
{
    public static function renderPostBody(string $body): string
    {
        // CHANGE 1: Replace /e-modifier preg_replace with preg_replace_callback so the replacement is plain PHP code, never eval'd from user input.
        $body = preg_replace_callback('/\[b\](.+?)\[\/b\]/s', function ($m) {
            // CHANGE 3: Encode captured content before embedding it in HTML to prevent stored XSS.
            return '<strong>' . htmlspecialchars($m[1], ENT_QUOTES, 'UTF-8') . '</strong>';
        }, $body);

        // CHANGE 1: Same /e removal for the italic rule; preg_replace_callback is safe because the callback is static PHP, not a user-supplied string.
        $body = preg_replace_callback('/\[i\](.+?)\[\/i\]/s', function ($m) {
            // CHANGE 3: htmlspecialchars was already present in the original replacement expression, but now it actually protects against XSS rather than running inside eval.
            return '<em>' . htmlspecialchars($m[1], ENT_QUOTES, 'UTF-8') . '</em>';
        }, $body);

        // CHANGE 1: /e modifier removed; preg_replace_callback used so neither the URL nor the link text is ever eval'd.
        // CHANGE 2: URL and link text are both sanitised before interpolation, removing the direct code-injection path that existed when \1 and \2 were dropped raw into an eval'd string.
        $body = preg_replace_callback(
            '/\[url=([^\]]+)\](.+?)\[\/url\]/s',
            function ($m) {
                // CHANGE 2: Validate that the URL scheme is http or https to block javascript: and data: URLs; raw user value was previously used as a bare PHP expression in the eval context.
                $url = $m[1];
                if (!preg_match('/^https?:\/\//i', $url)) {
                    $url = '#';
                }
                // CHANGE 3: Both the href attribute value and the link text are encoded so they cannot break out of their HTML context.
                $safeUrl  = htmlspecialchars($url,  ENT_QUOTES, 'UTF-8');
                $safeText = htmlspecialchars($m[2], ENT_QUOTES, 'UTF-8');
                return '<a href="' . $safeUrl . '">' . $safeText . '</a>';
            },
            $body
        );

        return $body;
    }
}
```

## Explanation

### Issue 1: `/e` Modifier Enables Arbitrary Code Execution

**Problem:** On PHP 5.6 the `preg_replace` `/e` flag causes the replacement string to be evaluated as PHP after back-references are substituted. An attacker who crafts a post body like `[b]{${phpinfo()}}[/b]` gets the captured group substituted into the replacement expression, which is then `eval`'d by PHP itself. Production is affected because PHP 7 silently dropped `/e` support, so the team's PHP 7.4 Docker environment never triggers the vulnerability.

**Fix:** Every `preg_replace(..., .../e', ...)` call is replaced with `preg_replace_callback(...)`. The callback receives the match array as a plain PHP value and constructs the HTML string with normal PHP string concatenation — no `eval` is ever involved.

**Explanation:** The `/e` modifier tells `preg_replace` to call `eval()` on the replacement string after performing back-reference substitution. Because the captured group content comes from user input, the attacker controls what ends up inside `eval`. Even the seemingly safe `[b]` rule is exploitable: the replacement template is `"'<strong>'.strtoupper('\\1').'</strong>'"`, and a crafted input can break out of the string literal via a quote, turning the rest into executable PHP. `preg_replace_callback` never calls `eval`; the callback is a static closure defined by the developer, so user input only ever reaches it as a data value, not as code. The `/s` flag is also added to allow the dot to match newlines, which prevents a user from escaping the pattern by embedding a newline in the tag content.

---

### Issue 2: Unsanitised URL Injected Directly into Eval Context

**Problem:** The `[url=...]` replacement string is `"'<a href=\''.\\1.'\'>'.\\.2.'</a>'"`. When `/e` eval's this, `\1` is the raw URL from the post body. A user who writes `[url='.system('id').'']click[/url]` injects a function call directly into the eval'd PHP expression, achieving remote code execution with no further tricks needed.

**Fix:** Inside the `preg_replace_callback` closure, `$m[1]` (the URL) is first checked against the regex `^https?://` and replaced with `'#'` if it does not match. It is then passed through `htmlspecialchars` before being written into the `href` attribute. The link text `$m[2]` is similarly encoded.

**Explanation:** In the original code, `\1` and `\2` are back-references that get textually substituted before `eval` runs, so whatever the user typed becomes a literal fragment of PHP source code. Removing `/e` already closes the code-execution path, but the URL still needs to be validated for scheme, because a `javascript:` or `data:` URI in an `href` causes client-side script execution even in plain HTML. The allowlist approach (`^https?://`) is safer than trying to blocklist dangerous schemes, because new schemes can be invented and URL parsers in different browsers may accept unusual encodings.

---

### Issue 3: Missing Output Encoding Allows Stored XSS

**Problem:** The `[b]` replacement calls `strtoupper` on the captured content but never calls `htmlspecialchars`. A post body containing `[b]<script>alert(1)</script>[/b]` emits a raw `<script>` tag into the page, executing JavaScript in any visitor's browser regardless of the code-execution vulnerability.

**Fix:** Every callback now wraps the user-supplied captured group in `htmlspecialchars($value, ENT_QUOTES, 'UTF-8')` before concatenating it into the HTML output. The `[i]` callback had `htmlspecialchars` in the original replacement expression, but it ran inside `eval`, so it was still susceptible to injection before encoding could occur; the fix moves it to safe, non-eval'd PHP.

**Explanation:** `htmlspecialchars` converts `<`, `>`, `"`, `'`, and `&` to their HTML entity equivalents, so any HTML or JavaScript a user embeds in a tag's content is rendered as visible text rather than parsed as markup. `ENT_QUOTES` is specified so that single quotes are also encoded, preventing an attacker from breaking out of an attribute value delimited by single quotes. Using `UTF-8` as the charset argument prevents multibyte encoding tricks (e.g., certain sequences in older encodings that collapse to `<` after charset conversion) from bypassing the encoding step.
