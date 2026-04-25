---
slug: crypto-random-math-random-fallback
track: javascript
orderIndex: 72
title: Math.random Fallback in Token Generation
difficulty: easy
tags:
  - security
  - crypto
  - randomness
language: javascript
---

## Context

The file `src/auth/token.js` generates short-lived CSRF tokens sent to browser clients and validated on state-changing requests. The function was written to use the Web Crypto API (`crypto.getRandomValues`) and was later updated to "support older environments" by adding a `Math.random`-based fallback.

A security audit flagged that tokens generated in certain environments are predictable. An attacker who can observe several tokens can predict future ones and forge valid CSRF tokens, bypassing the protection entirely.

The team noted the fallback path is hit in their Node.js integration test environment (Node versions before 19 where `globalThis.crypto` is not automatically available), meaning a significant fraction of their test-generated tokens — and potentially production tokens in some deployment configurations — are cryptographically weak.

## Buggy code

```javascript
const TOKEN_LENGTH = 32;

/**
 * Generates a random hex token for CSRF protection.
 * @returns {string}
 */
function generateCsrfToken() {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    const bytes = new Uint8Array(TOKEN_LENGTH);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback for environments without Web Crypto
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH * 2; i++) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}

module.exports = { generateCsrfToken };
```
