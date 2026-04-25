---
slug: innerHTML-xss
track: javascript
orderIndex: 69
title: Unsanitised innerHTML Assignment
difficulty: easy
tags:
  - security
  - xss
  - dom
language: javascript
---

## Context

This code lives in `public/js/comments.js`, a vanilla JS module that fetches and renders a paginated list of user-submitted comments from the backend. The comments are stored as raw text in the database and are returned verbatim through the `/api/comments` endpoint.

During a security review, the reviewer was able to execute arbitrary JavaScript in another user's browser by submitting a comment containing an HTML `<script>` tag (or an `<img onerror=...>` attribute). The attack vector is stored XSS: the malicious payload is persisted in the database and executed for every user who views the page.

The development team originally used `textContent` but switched to `innerHTML` in order to support basic markdown-like line breaks. They haven't introduced a sanitisation library.

## Buggy code

```javascript
async function loadComments(postId) {
  const response = await fetch(`/api/comments?postId=${postId}`);
  const { comments } = await response.json();

  const container = document.getElementById("comments-container");
  container.innerHTML = "";  // clear previous

  for (const comment of comments) {
    const div = document.createElement("div");
    div.className = "comment";

    // Support newlines in comments by converting \n to <br>
    const formatted = comment.body
      .replace(/\n/g, "<br>");

    div.innerHTML = `
      <span class="author">${comment.author}</span>
      <p>${formatted}</p>
    `;

    container.appendChild(div);
  }
}
```
