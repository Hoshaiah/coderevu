## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Locale-Sensitive Sort Non-Deterministic
// ------------------------------------------------------------------------

/**
 * Sorts an array of contact objects alphabetically by lastName.
 * Returns a new array; does not mutate the input.
 *
 * @param {Array<{id: string, firstName: string, lastName: string}>} contacts
 * @param {string} [locale='en'] - BCP 47 locale tag; must be the same tag used by the API server.
 * @returns {Array}
 */
// CHANGE 1+2: Accept an explicit locale parameter (defaults to 'en') so both client and server always use the same collation, and replace the manual < / > operator comparison with localeCompare using that pinned locale and sensitivity:'base' so accented/case variants collate correctly.
function sortContacts(contacts, locale = 'en') {
  return contacts.slice().sort((a, b) =>
    a.lastName.localeCompare(b.lastName, locale, { sensitivity: 'base' })
  );
}

module.exports = { sortContacts };
```

## Explanation

### Issue 1: Implicit locale causes environment-dependent sort order

**Problem:** The sort order displayed in German and Turkish users' browsers differs from the order the Node.js API server computes, so paginated queries skip or duplicate contacts. Names with characters like `ö`, `ü`, `ß`, and `İ` are the ones affected because those characters sort very differently depending on which locale's collation rules are active.

**Fix:** A `locale` parameter (defaulting to `'en'`) is added to `sortContacts`, and that same tag is forwarded to `localeCompare` as its second argument. Both the browser call-site and the Node.js call-site must pass the same BCP 47 tag (e.g., `'en'`) to guarantee identical ordering.

**Explanation:** `toLocaleLowerCase()` with no argument and the `<`/`>` operators both implicitly use whatever locale the JavaScript runtime was started with. In a Turkish browser the runtime locale is `tr-TR`; on a Node.js server running under a default `en-US` locale the runtime locale is different. The Turkish locale treats `İ` (capital dotted I) and `i` as the same letter, while English does not, so the two environments produce a different ordering for any name containing that character. Pinning one explicit locale tag and passing it consistently to `localeCompare` means both environments run the exact same collation algorithm regardless of where the process is running. A related pitfall: if you later need locale-specific sorting (e.g., show German contacts in German order), you can expose the locale parameter to callers, but both client and server must always agree on the value.

---

### Issue 2: Relational operators bypass Unicode collation

**Problem:** Even when running in the same locale, using `<` and `>` on lowercased strings does not produce correct alphabetical order for characters outside the ASCII range. A German user sees `ö` sorted after `z` instead of near `o`, because the comparison is done on raw UTF-16 code units, not on the language's collation order.

**Fix:** The entire comparator body is replaced with a single call to `a.lastName.localeCompare(b.lastName, locale, { sensitivity: 'base' })`, removing the `toLocaleLowerCase` calls and the `<`/`>` branches entirely.

**Explanation:** JavaScript's `<` and `>` operators compare strings by iterating UTF-16 code units in numeric order. `ö` has code point U+00F6 (246), which is higher than `z` at U+007A (122), so `'öztürk' > 'zahn'` is `true` — the name sorts after Z in the list. `localeCompare` instead delegates to the ICU collation library using the specified locale's rules, where `ö` collates near `o`. The `sensitivity: 'base'` option tells the collator to treat letters that differ only by case or accent as equal for ordering purposes, which is equivalent to what the original `toLocaleLowerCase` was trying to achieve — but done correctly inside the collation engine rather than with a pre-processing step that alters code points before comparison.
