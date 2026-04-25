## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Computed Key Collision Silently Overwrites
// ------------------------------------------------------------------------

/**
 * Groups an array of products by their category.
 * @param {Array<{id: string, name: string, category: string, price: number}>} products
 * @returns {Record<string, Array>} grouped products
 */
function groupByCategory(products) {
  // CHANGE 1: Use Object.create(null) instead of {} so the result has no prototype chain and keys like 'constructor', 'toString', or 'hasOwnProperty' are stored as plain data properties without colliding with Object.prototype.
  const groups = Object.create(null);

  for (const product of products) {
    const key = product.category.toLowerCase().trim();

    // CHANGE 2: Use Object.prototype.hasOwnProperty.call(groups, key) instead of !groups[key] to check only own properties, avoiding false positives from inherited prototype values and correctly handling any falsy-but-valid future values.
    if (!Object.prototype.hasOwnProperty.call(groups, key)) {
      groups[key] = [];
    }

    groups[key].push(product);
  }

  return groups;
}

module.exports = { groupByCategory };
```

## Explanation

### Issue 1: Prototype Key Collision Drops Categories

**Problem:** Categories whose lowercased names match properties on `Object.prototype` — such as `"constructor"`, `"toString"`, or `"hasOwnProperty"` — are never stored correctly. When the code does `groups["constructor"]`, it reads or overwrites the inherited `constructor` function rather than creating a new own property. The reporting job receives an output object that silently omits those categories entirely, with no error thrown.

**Fix:** Replace `const groups = {}` with `const groups = Object.create(null)` (CHANGE 1). This creates a plain dictionary object with no prototype, so every key — including `"constructor"` and `"toString"` — is stored as a genuine own property with no shadowing.

**Explanation:** Every object literal `{}` inherits from `Object.prototype`, which defines properties like `constructor`, `toString`, `valueOf`, and `hasOwnProperty`. When you write `groups["toString"] = []`, JavaScript sets an own property that shadows the inherited one, which actually works for assignment. However, the `if (!groups[key])` check in the original code reads `groups["toString"]` before any assignment and gets the inherited function (a truthy value), so the branch that initializes the array is never entered. Then `groups["toString"].push(product)` calls `push` on the built-in `toString` function object, which silently does nothing useful (or throws in strict mode depending on the engine). Using `Object.create(null)` eliminates the prototype entirely, so property lookups only ever find data you explicitly stored.

---

### Issue 2: Falsy Check Misidentifies Inherited Prototype Values

**Problem:** The guard `if (!groups[key])` returns `true` when `groups[key]` is falsy and `false` when it is truthy. For a plain `{}` object, inherited prototype methods are truthy functions, so the guard skips array initialization for those keys even though no array has been stored yet. This compounds Issue 1 and would also break if a valid category key ever produced a falsy own value in a future refactor.

**Fix:** Replace `if (!groups[key])` with `if (!Object.prototype.hasOwnProperty.call(groups, key))` (CHANGE 2). This tests strictly whether the current `groups` object owns a property under `key`, independent of the prototype chain or the property's value.

**Explanation:** `hasOwnProperty` only returns `true` for properties set directly on the object itself, not inherited ones. Calling it as `Object.prototype.hasOwnProperty.call(groups, key)` (rather than `groups.hasOwnProperty(key)`) is the safe form: if `groups` is created with `Object.create(null)` it has no `hasOwnProperty` method of its own, so `groups.hasOwnProperty(...)` would throw a `TypeError`. Borrowing the method from `Object.prototype` directly avoids that. Together with CHANGE 1, this ensures that every category — including those with prototype-colliding names — gets its own array initialized exactly once before `.push` is called.
