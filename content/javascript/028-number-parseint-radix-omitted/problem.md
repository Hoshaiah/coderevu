---
slug: number-parseint-radix-omitted
track: javascript
orderIndex: 28
title: parseInt Octal Parsing Surprise
difficulty: easy
tags:
  - types
  - correctness
  - javascript
language: javascript
---

## Context

This utility lives in `src/utils/permissions.js` and is part of an admin dashboard that reads Unix-style permission bits sent as strings from an API (e.g. `"0755"`, `"0644"`). The parsed integer is then used in bitwise checks to decide whether to render certain action buttons.

Users report that permission checks fail intermittently for files whose permission string starts with `0`. For example, a file with permissions `"0755"` incorrectly appears as restricted even though the server confirms the user has access. Files with permissions like `"755"` work fine.

The team added some logging and found that `parseInt("0755")` was returning `493` in older browsers but `755` in newer ones, making behaviour environment-dependent.

## Buggy code

```javascript
/**
 * Parses a Unix permission string and checks if the owner has write access.
 * @param {string} permString - e.g. "0755", "0644"
 * @returns {boolean}
 */
function ownerCanWrite(permString) {
  const bits = parseInt(permString);
  // Owner write bit is the 128 position in the full octal value
  return (bits & 128) !== 0;
}

// Example usage:
console.log(ownerCanWrite("0755")); // should be true
console.log(ownerCanWrite("0644")); // should be true
console.log(ownerCanWrite("0444")); // should be false
```
