## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Tagged Template Receives Raw Strings
// ------------------------------------------------------------------------

/**
 * Tagged template literal that builds a parameterized SQL query object.
 * Usage: sql`SELECT * FROM users WHERE id = ${userId}`
 */
function sql(strings, ...values) {
  // CHANGE 1: use `strings` (the cooked array) instead of `strings.raw` so that escape sequences are interpreted and the correct template parts are used to build the query
  const parts = strings;
  let text = "";
  const params = [];

  parts.forEach((part, i) => {
    text += part;
    if (i < values.length) {
      // Intended: add placeholder and push value to params
      params.push(values[i]);
      text += `$${params.length}`;
    }
  });

  return { text, values: params };
}

// Usage
const userId = req.params.id; // user-supplied
const query = sql`SELECT * FROM users WHERE id = ${userId}`;
await db.query(query.text, query.values);

module.exports = { sql };
```

## Explanation

### Issue 1: `strings.raw` Used Instead of `strings`

**Problem:** The tag function reads `strings.raw` to get the template parts. `strings.raw` contains the *raw* source text of each template segment — backslash sequences like `\n` appear as the two characters `\` and `n` rather than a newline. More importantly, this is simply the wrong property to use for building query text, and it was the source of confusion during the audit: while the interpolation loop itself is logically correct, reading from `strings.raw` is semantically incorrect and will produce malformed SQL whenever any template segment contains an escape sequence.

**Fix:** Replace `strings.raw` with `strings` directly. In the reference solution, `const parts = strings` replaces `const rawParts = strings.raw`, so the loop iterates over the cooked string array that JavaScript's template literal machinery has already processed.

**Explanation:** When JavaScript calls a tag function, the first argument is an array-like object (`TemplateStringsArray`) whose elements are the cooked string parts between interpolations — escape sequences already resolved. That same object has a `.raw` property holding the unprocessed source strings. For constructing SQL text you want the cooked parts, not the raw ones. A template like `` sql`SELECT *
FROM users` `` would place the literal characters `\n` into the SQL string instead of a newline if you read `.raw`. In this codebase the audit found `values` empty in production queries; the developer's static-string test passed because their test string had no escape sequences and no interpolations, so `.raw` and the cooked array were identical — masking the bug entirely.

---
