## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Unsanitised innerHTML Assignment
// ------------------------------------------------------------------------

async function loadComments(postId) {
  const response = await fetch(`/api/comments?postId=${postId}`);
  const { comments } = await response.json();

  const container = document.getElementById("comments-container");
  container.innerHTML = "";  // clear previous

  for (const comment of comments) {
    const div = document.createElement("div");
    div.className = "comment";

    // CHANGE 1: Escape comment.body as text first, then replace literal newline characters with <br> so only the line-break tag is ever injected, not arbitrary HTML from user input.
    const escaped = comment.body
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const formatted = escaped.replace(/\n/g, "<br>");

    // CHANGE 2: Set comment.author via textContent on a dedicated element instead of interpolating it directly into the innerHTML template, preventing any HTML in the author field from being parsed as markup.
    const authorSpan = document.createElement("span");
    authorSpan.className = "author";
    authorSpan.textContent = comment.author;

    const bodyP = document.createElement("p");
    bodyP.innerHTML = formatted;

    div.appendChild(authorSpan);
    div.appendChild(bodyP);

    container.appendChild(div);
  }
}
```

## Explanation

### Issue 1: Unsanitised body injected via innerHTML

**Problem:** `comment.body` is inserted directly into the DOM via `innerHTML` after only a newline-to-`<br>` substitution. An attacker who stores a comment containing `<img src=x onerror=alert(document.cookie)>` sees that payload execute in every visitor's browser when the comment list loads.

**Fix:** Before the `\n → <br>` replacement, five `replace` calls convert the five characters that have special meaning in HTML (`&`, `<`, `>`, `"`, `'`) to their HTML entity equivalents. Only after that safe text is produced does the `\n → <br>` replacement run, so the only raw HTML tag that ever enters `innerHTML` is `<br>`, which comes from the application itself.

**Explanation:** `innerHTML` hands the browser's HTML parser the string you give it. Any `<` that appears in that string starts a tag, and any event attribute on that tag runs JavaScript. HTML-entity encoding converts `<` to `&lt;`, which the parser renders as the literal character `<` rather than a tag boundary. The `&` entity must be encoded first — encoding it last would double-encode the `&` in the entities you already wrote. A related pitfall: encoding only `<` and `>` while leaving `"` unescaped is still exploitable inside HTML attribute values (e.g. `<div title="...">`), so all five characters need to be covered.

---

### Issue 2: Unsanitised author injected via innerHTML template literal

**Problem:** `comment.author` is interpolated directly into the backtick template string that is assigned to `div.innerHTML`. An attacker who registers a username containing `<script>alert(1)</script>` (or controls the author field through the API) can inject HTML through this second path even if the body is fixed.

**Fix:** A dedicated `authorSpan` element is created with `document.createElement("span")` and its content is set using `authorSpan.textContent = comment.author` instead of string interpolation. `textContent` never invokes the HTML parser, so no characters in the author string are treated as markup. The `bodyP` element is built separately and both elements are appended to `div` with `appendChild`.

**Explanation:** When you write `` div.innerHTML = `<span>${comment.author}</span>` ``, the browser parses the entire string as HTML. `textContent`, by contrast, sets the DOM text node directly — the string is stored verbatim and displayed verbatim, with the browser responsible for escaping it when rendering. Splitting the construction into individual `createElement` + `textContent` / `innerHTML` calls per element makes the trust boundary explicit: only the already-escaped `formatted` string enters an `innerHTML` assignment, and nothing from user input reaches it raw.
