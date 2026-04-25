---
slug: string-concat-plus-operator-xss
track: javascript
orderIndex: 76
title: Template String innerHTML XSS Vector
difficulty: medium
tags:
  - security
  - xss
  - dom
language: javascript
---

## Context

This function lives in `src/ui/notifications.js` and renders a toast notification banner into the DOM. It is called from throughout the SPA whenever the application needs to surface a message to the user — including messages that include user-provided content such as a filename, a search term, or a comment excerpt.

A penetration test flagged a stored XSS vulnerability: an attacker who controls the `message` string (e.g., via a crafted filename synced from the server) can inject arbitrary HTML and execute JavaScript in the context of other users' sessions. The finding included a working payload that exfiltrates the session cookie.

The developer confirmed that the server correctly stores and returns the raw unsanitized string, trusting the client to escape it.

## Buggy code

```javascript
const container = document.getElementById('notifications');

function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  toast.innerHTML = `
    <span class="toast__icon">${type === 'error' ? '✖' : 'ℹ'}</span>
    <span class="toast__message">${message}</span>
    <button class="toast__close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) toast.remove();
  }, 5000);
}

module.exports = { showNotification };
```
