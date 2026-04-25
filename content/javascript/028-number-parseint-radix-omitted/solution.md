## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — parseInt Octal Parsing Surprise
// ------------------------------------------------------------------------

/**
 * Parses a Unix permission string and checks if the owner has write access.
 * @param {string} permString - e.g. "0755", "0644"
 * @returns {boolean}
 */
function ownerCanWrite(permString) {
  // CHANGE 1: Always pass radix 8 to parseInt so that strings like "0755" are consistently parsed as octal regardless of browser/environment.
  const bits = parseInt(permString, 8);
  // CHANGE 2: Use 0o200 (decimal 128) as the owner write bit mask, expressed in octal literal form to make the intent clear and match Unix permission semantics.
  return (bits & 0o200) !== 0;
}

// Example usage:
console.log(ownerCanWrite("0755")); // should be true
console.log(ownerCanWrite("0644")); // should be true
console.log(ownerCanWrite("0444")); // should be false
```

## Explanation

### Issue 1: Missing radix in `parseInt` call

**Problem:** `parseInt(permString)` without a radix behaves differently depending on the JavaScript engine and its version. Older browsers treat a leading `0` as a signal to parse the number in base 8 (octal), so `parseInt("0755")` returns `493`. Modern engines parse it as decimal and return `755`. This means the same permission string produces different integers in different environments, so bitwise checks pass in one browser and fail in another.

**Fix:** Replace `parseInt(permString)` with `parseInt(permString, 8)` at the CHANGE 1 site, explicitly telling the parser to always use base 8.

**Explanation:** The ECMAScript spec made octal auto-detection via a leading `0` optional and later deprecated it, so browser behaviour diverged. Passing `8` as the second argument forces `parseInt` to treat the entire string — leading zero included — as an octal number every time. For `"0755"` that produces `493` (= 7×64 + 5×8 + 5) consistently, which is the correct integer representation of Unix mode `0755`. Without the radix, newer engines return `755` in decimal, and then `755 & 128` equals `128` which happens to be truthy — masking the bug in modern environments and making it appear only in older ones.

---

### Issue 2: Semantically opaque bit mask `128` instead of `0o200`

**Problem:** The comment says "Owner write bit is the 128 position", but Unix permission bits are defined in octal. Writing the mask as the decimal literal `128` obscures the meaning and makes it easy to pick the wrong constant when maintaining the code. While `128` and `0o200` are the same integer value, the intent is invisible at a glance.

**Fix:** Replace the mask `128` with `0o200` at the CHANGE 2 site, using JavaScript's octal literal syntax so the value maps directly to the Unix permission table.

**Explanation:** In Unix permissions, the owner write bit sits at octal position `200` (the second digit from the left in a three-digit octal mode). Writing `0o200` in source code lets any reader immediately match the constant to a permissions table or `chmod` documentation without doing mental base conversion. The numeric value is identical — `0o200 === 128` — so this change has no runtime effect, but it prevents future maintainers from accidentally substituting a decimal value that looks plausible but is wrong (e.g. confusing the group write bit `0o020` = decimal 16 with `20` in decimal, which is a completely different bit).
