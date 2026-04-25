## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — User Input Injected Into Regex
# ------------------------------------------------------------------------

class ContentHighlighter
  def self.highlight(text, term)
    return text if term.blank?

    # CHANGE 1: Escape all regex metacharacters in the user-supplied term before compiling the pattern, preventing regex injection and ReDoS via crafted quantifiers.
    # CHANGE 2: Regexp.escape neutralises nested quantifiers and special syntax, which is also the primary defence against ReDoS from user input.
    safe_term = Regexp.escape(term)
    regex = Regexp.new(safe_term, Regexp::IGNORECASE)

    # CHANGE 3: HTML-escape both the surrounding text and the matched fragment before injecting into markup, preventing XSS from article body or term content.
    escaped_text = CGI.escapeHTML(text)
    safe_regex = Regexp.new(safe_term, Regexp::IGNORECASE)
    escaped_text.gsub(safe_regex) { |match| "<mark>#{CGI.escapeHTML(match)}</mark>" }
  end
end

# Example call from search results view:
# ContentHighlighter.highlight(article.body, params[:q])
```

## Explanation

### Issue 1: Regex Injection via Unsanitized User Input

**Problem:** The `term` parameter is passed straight to `Regexp.new`, so any regex metacharacter the user types becomes part of the compiled pattern. Submitting `(?i)admin` silently enables a case-insensitive flag embedded in the pattern itself, causing the highlighter to match content the caller did not intend. Submitting `(` or `*` raises a `RegexpError`, which the Rack middleware propagates as a 500 response.

**Fix:** `Regexp.escape(term)` is called on the raw input before it reaches `Regexp.new`, producing `safe_term` where every metacharacter is backslash-escaped. The `Regexp::IGNORECASE` flag is then applied at the Ruby level intentionally, not injected by the user.

**Explanation:** `Regexp.new` treats its first argument as a raw pattern string. Any character that has special meaning in POSIX/PCRE regex — parentheses, quantifiers, anchors, inline flags like `(?i)` — is interpreted literally in the pattern. `Regexp.escape` converts those characters to their escaped equivalents (e.g., `(` becomes `\(`), so the resulting pattern matches the literal string the user typed. Without this step, a user who knows regex syntax can manipulate match behaviour or produce invalid patterns at will.

---

### Issue 2: ReDoS from Nested Quantifiers

**Problem:** A user submitting a string like `(a+)+$` constructs a pattern with exponential backtracking. Ruby's default regex engine (Oniguruma) is vulnerable to this class of input; processing such a pattern against a long article body can peg one CPU core for many seconds, effectively hanging the request.

**Fix:** The same `Regexp.escape(term)` call at the CHANGE 2 site escapes `(`, `+`, and all other quantifier characters so they are treated as literals. The compiled pattern can never contain recursive or nested quantifiers derived from user input.

**Explanation:** ReDoS (Regular Expression Denial of Service) occurs when a regex engine tries an exponential number of partial matches before deciding the overall match fails. The trigger is usually a pattern where two quantified groups overlap, such as `(a+)+`. Because `Regexp.escape` turns `(` into `\(` and `+` into `\+`, the compiled regex is always a simple literal string search, which runs in linear time. The only way this defence can be bypassed is if the application later concatenates the escaped term with unescaped template strings, so take care not to add raw metacharacters around the escaped fragment.

---

### Issue 3: XSS via Unescaped HTML in Output

**Problem:** The method wraps the matched text in `<mark>` tags and returns the result directly into rendered HTML. If `text` (the article body) or `term` (the search query) contains characters like `<`, `>`, or `&`, the output will contain raw HTML tags or malformed markup, enabling a reflected or stored cross-site scripting attack.

**Fix:** `CGI.escapeHTML(text)` is applied to the full article body before the `gsub`, and `CGI.escapeHTML(match)` is applied to each matched fragment before it is placed inside the `<mark>` tag. Both calls are added at the CHANGE 3 site.

**Explanation:** The original code assumes `text` is already safe HTML, but that assumption is not enforced anywhere. A stored article body containing `<script>alert(1)</script>` would pass straight through. Similarly, a search term like `<img src=x onerror=alert(1)>` — even after `Regexp.escape` makes it match literally — would still be interpolated as raw HTML into the `<mark>` tag. Escaping the body before the substitution converts any HTML in the source to safe entities, and escaping the match fragment ensures the highlighted portion is also entity-encoded before it re-enters the markup.
