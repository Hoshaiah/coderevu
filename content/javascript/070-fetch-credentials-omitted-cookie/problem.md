---
slug: fetch-credentials-omitted-cookie
track: javascript
orderIndex: 70
title: Session Cookie Not Sent on Fetch
difficulty: easy
tags:
  - security
  - async
  - javascript
language: javascript
---

## Context

This file is `src/api/client.js`, the central HTTP client module used across a React SPA. The backend is a separate Express server on `https://api.example.com` while the frontend is served from `https://app.example.com`. Authentication is session-based: the server sets a `HttpOnly` session cookie on login, and every subsequent API call is expected to include that cookie.

Users report being randomly logged out mid-session and seeing 401 responses from the API. The session cookie is present in the browser's cookie store (visible in DevTools), but the network tab shows that API requests do not include a `Cookie` header. The backend team confirmed the session is valid and CORS is correctly configured with `Access-Control-Allow-Credentials: true`.

The frontend team verified the `fetch` calls are reaching the right URL and that the cookie's `SameSite` and `Domain` attributes are correct. The issue persists across all browsers.

## Buggy code

```javascript
const BASE_URL = "https://api.example.com";

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message);
  }

  return response.json();
}

export async function getUser(userId) {
  return apiFetch(`/users/${userId}`);
}

export async function updateUser(userId, data) {
  return apiFetch(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
```
