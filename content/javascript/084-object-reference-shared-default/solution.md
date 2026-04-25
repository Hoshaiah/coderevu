## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Multiple requests corrupt each other's filter options through a shared object default
// ------------------------------------------------------------------------
// CHANGE 1: Move the default value out of the parameter list and construct a fresh defaults object on every call so no state is shared between requests.
function buildQuery(userOptions) {
  const defaults = { page: 1, limit: 20, filters: {} };

  // CHANGE 2: Use Object.assign into a new object literal instead of mutating defaults.filters, so each call produces an independent filters object.
  const mergedFilters = Object.assign({}, defaults.filters, userOptions.filters);

  return {
    page: userOptions.page || defaults.page,
    limit: userOptions.limit || defaults.limit,
    filters: mergedFilters,
  };
}

app.get("/products", (req, res) => {
  const query = buildQuery({
    page: Number(req.query.page),
    filters: { category: req.query.category },
  });
  db.products.find(query).then((rows) => res.json(rows));
});
```

## Explanation

### Issue 1: Default parameter object shared across calls

**Problem:** Every call to `buildQuery` that omits the second argument receives the exact same `defaults` object — the one JavaScript evaluates once when the function is defined. Under load, request A mutates `defaults.filters`, and when request B reads `defaults.filters` a millisecond later it sees request A's category or price range in the results.

**Fix:** Remove `defaults` from the parameter list entirely and replace it with `const defaults = { page: 1, limit: 20, filters: {} };` as the first line of the function body. A new plain object is created on every invocation, so no call can observe state left by a previous one.

**Explanation:** JavaScript evaluates default parameter expressions once at parse/load time, not once per call. The resulting object is stored in memory and reused as-is for every call that does not supply that argument. Any property mutation on that object is therefore globally visible. Moving the literal inside the function body makes object creation part of the call's own execution context, giving each invocation its own isolated copy. A related pitfall is doing the same thing with a module-level `const DEFAULT_OPTIONS = {...}` and then mutating it directly — the fix is identical: copy, don't mutate.

---

### Issue 2: In-place mutation of `defaults.filters`

**Problem:** `Object.assign(defaults.filters, userOptions.filters)` writes the caller's filter keys directly onto the shared `defaults.filters` object. Even if Issue 1 were fixed, any code that held a reference to that object (e.g. logging middleware, a cached reference) would see the mutated version.

**Fix:** Replace `Object.assign(defaults.filters, userOptions.filters)` with `Object.assign({}, defaults.filters, userOptions.filters)` stored in a new `const mergedFilters`. The first argument is a fresh `{}`, so neither `defaults.filters` nor `userOptions.filters` is modified; the merged result lives only in `mergedFilters`, which is then returned.

**Explanation:** `Object.assign(target, ...sources)` copies enumerable own properties from each source into `target` and returns `target`. When `target` is an existing object, all those writes land on the original reference, mutating it for anyone who holds that reference. Passing a new `{}` as the target means the merge result is a brand-new object with no aliases pointing at it, so neither the defaults nor the caller's options object is touched. This pattern — `Object.assign({}, a, b)` or the equivalent spread `{ ...a, ...b }` — is the standard way to produce a merged object without side effects.
