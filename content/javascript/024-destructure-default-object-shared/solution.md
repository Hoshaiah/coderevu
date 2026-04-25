## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Shared Default Object Across Calls
// ------------------------------------------------------------------------

/**
 * Builds a MongoDB query configuration object.
 * @param {object} options
 * @returns {object}
 */
function buildQuery(options = {}) {
  // CHANGE 1: Use a fresh object {} as the target of Object.assign so the defaults literal is never mutated.
  const defaults = {
    // CHANGE 2: Spread nested objects so each call gets its own filter and projection, not a shared reference.
    filter: {},
    projection: { _id: 1 },
    limit: 100,
    skip: 0,
  };

  // CHANGE 1: Assign into a new empty object instead of into defaults, so defaults is never modified.
  const config = Object.assign({}, defaults, options);

  // CHANGE 2: Ensure config.filter is a new object merging defaults.filter with any caller-supplied filter, so mutations stay local.
  config.filter = Object.assign({}, defaults.filter, options.filter);

  if (config.filter.status === undefined) {
    config.filter.status = "active";
  }

  return config;
}

module.exports = { buildQuery };

// Simulated request cycle:
const q1 = buildQuery({ filter: { userId: "abc" } });
console.log(q1.filter); // { userId: 'abc', status: 'active' }

const q2 = buildQuery({});
console.log(q2.filter); // { status: 'active' }
```

## Explanation

### Issue 1: Object.assign Mutates Defaults Target

**Problem:** Every call to `buildQuery` uses the same `defaults` object literal as the first argument to `Object.assign`, which writes all merged properties directly back into `defaults`. After the first call, `defaults` is no longer the pristine seed value — it carries whatever the caller passed in. The next call starts from that already-dirty object.

**Fix:** Replace `Object.assign(defaults, options)` with `Object.assign({}, defaults, options)`. Using a new empty object `{}` as the target means `defaults` is only read, never written to.

**Explanation:** `Object.assign(target, ...sources)` copies all enumerable own properties from each source into `target` and returns `target`. When `defaults` is `target`, it is permanently altered for the rest of the process lifetime because the same object is re-created in source text but that re-creation only happens when the module is first loaded — not on every function call. JavaScript module evaluation is cached by the runtime, so the `defaults` literal is initialized exactly once. Every subsequent call to `buildQuery` references the same object in memory. Switching to `{}` as the target means each call produces a fresh merged object and `defaults` is left untouched.

---

### Issue 2: Nested Object References Shared Across Calls

**Problem:** Even with a new target object, `Object.assign` performs a shallow copy. The `filter: {}` value inside `defaults` is an object reference. When the caller passes `{ filter: { userId: 'abc' } }`, `options.filter` replaces `defaults.filter` on the config, but if no filter is passed, `config.filter` points at the exact same `{}` object that lives inside `defaults`. Writing `config.filter.status = "active"` then mutates that shared object, so the next caller who also passes no filter picks up `status: 'active'` pre-populated — and any keys written by prior calls.

**Fix:** After the top-level merge, explicitly rebuild `config.filter` with `Object.assign({}, defaults.filter, options.filter)`. This produces a new object for every call regardless of whether the caller supplied a filter.

**Explanation:** Shallow copy means one level of properties is duplicated, but any value that is itself an object is not cloned — only its reference is copied. So `config.filter` and `defaults.filter` point at the same heap object when no caller-supplied filter overrides it. The subsequent mutation `config.filter.status = "active"` writes through that shared reference. By explicitly creating a new object for `config.filter` via `Object.assign({}, defaults.filter, options.filter)`, each call gets its own isolated filter. A related pitfall applies to `projection` — if callers ever mutate the returned projection, the same sharing problem would surface there, so the same pattern (`Object.assign({}, defaults.projection, options.projection)`) should be applied if projection mutation is ever needed.
