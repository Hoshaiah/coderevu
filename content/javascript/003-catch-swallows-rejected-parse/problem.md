---
slug: catch-swallows-rejected-parse
track: javascript
orderIndex: 3
title: Silent Catch Hides Parse Error
difficulty: easy
tags:
  - async
  - error-handling
  - promises
language: javascript
---

## Context

This utility function lives in `src/api/parseResponse.js` and is used across a React app to fetch and parse JSON from a REST API. It is called in dozens of places where callers assume the returned Promise resolves to the parsed body or rejects with a meaningful error.

In production, some API calls silently return `undefined` instead of data, causing downstream `Cannot read property 'id' of undefined` errors far from the actual source. The network tab shows the server returning valid JSON with a `200` status, but the parsed data never arrives.

The team already confirmed the API response is well-formed. They assumed the issue was a missing `await` somewhere up the call chain, but adding `await` everywhere didn't help.

## Buggy code

```javascript
async function fetchJson(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err.message.startsWith('HTTP error')) {
      throw err;
    }
    // Network errors or parse errors — treat as empty
    console.warn('fetchJson failed silently:', err.message);
  }
}

export default fetchJson;
```
