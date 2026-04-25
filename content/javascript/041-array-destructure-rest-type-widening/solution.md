## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Rest Destructure Widens Tuple Type
// ------------------------------------------------------------------------

type Status = 'active' | 'inactive' | 'pending';

interface ParsedRow {
  id: number;
  status: Status;
  attributes: string[];
}

function parseCsvRow(line: string): ParsedRow {
  const parts = line.split(',');
  const [rawId, rawStatus, ...attributes] = parts;

  const id = Number(rawId);
  const status = rawStatus as Status;

  // Downstream code that processes each attribute pair
  const processed = attributes.map((attr, i) => {
    if (i % 2 === 0) {
      const key = attr;
      // CHANGE 1: Guard against a missing pair partner before calling .trim() — when the attributes array has an odd number of elements, attributes[i + 1] is undefined and .trim() throws; the guard returns null instead.
      const rawValue = attributes[i + 1];
      if (rawValue === undefined) return null;
      const value = rawValue.trim();
      return `${key}=${value}`;
    }
    return null;
  }).filter(Boolean);

  // CHANGE 2: Assert parts as a tuple [string, string, ...string[]] so TypeScript knows the first two slots are always present and the rest element is the dynamic tail, making the shape explicit to the compiler.
  const _partsCheck = parts as [string, string, ...string[]];
  void _partsCheck;

  return { id, status, attributes: processed as string[] };
}
```

## Explanation

### Issue 1: Out-of-bounds access on unpaired attribute

**Problem:** When a CSV row has an odd number of columns after the first two (e.g., `1,active,key1`), `attributes` has one element. Inside the `map` callback, when `i` is `0`, the code reads `attributes[1]` which is `undefined`. Calling `.trim()` on `undefined` throws `Cannot read properties of undefined (reading 'trim')` at runtime.

**Fix:** At the `CHANGE 1` site, `attributes[i + 1]` is stored in `rawValue` and checked for `undefined` before `.trim()` is called. If `rawValue` is `undefined`, the callback returns `null` early, which `filter(Boolean)` then removes.

**Explanation:** JavaScript arrays return `undefined` for any index beyond their length — no exception is thrown on the read itself, only on the subsequent property access. TypeScript does not flag `attributes[i + 1]` because `attributes` is `string[]`, and indexing a `string[]` with a `number` is typed as `string`, not `string | undefined` (unless `noUncheckedIndexedAccess` is enabled in `tsconfig.json`). That mismatch between the inferred type and the runtime reality is why the compiler stays silent while production crashes. Enabling `noUncheckedIndexedAccess` would have surfaced this at compile time by widening the element type to `string | undefined`.

---

### Issue 2: `string[]` inference hides structural expectations

**Problem:** `line.split(',')` returns `string[]`. The destructuring `const [rawId, rawStatus, ...attributes] = parts` therefore gives `rawId: string`, `rawStatus: string`, and `attributes: string[]` — TypeScript sees no structural contract. If the function is ever called with a line that has fewer than two columns, `rawId` or `rawStatus` can silently be `undefined` typed as `string`, masking a second class of runtime errors.

**Fix:** At the `CHANGE 2` site, the array is asserted as the tuple `[string, string, ...string[]]`, making the two required leading slots explicit to the compiler and documenting the minimum expected shape of the input.

**Explanation:** TypeScript widens array literals and `split` results to `string[]` rather than inferring a tuple, because the length is not statically known. The rest-destructure syntax `...attributes` looks like it narrows to a tuple, but TypeScript only uses that syntax to distribute the `string[]` type — it does not infer a minimum-length constraint. Casting to `[string, string, ...string[]]` is a lightweight way to document and enforce the contract without rewriting the parsing logic. A stricter alternative is to validate `parts.length >= 2` explicitly and throw a descriptive error before destructuring.
