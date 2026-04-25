## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Shared Mutable Array Across Instances
// ------------------------------------------------------------------------

// CHANGE 2: Removed the duplicate first Pipeline class declaration — it was dead code that shadowed nothing but caused confusion; only one definition should exist.
class Pipeline {
  // CHANGE 1: Changed `static steps = []` to an instance field `steps = []` so each Pipeline instance gets its own array instead of sharing one array on the class itself.
  steps = [];
  name;

  constructor(name) {
    this.name = name;
  }

  addStep(fn) {
    this.steps.push(fn);
    return this;
  }

  async run(input) {
    let value = input;
    for (const step of this.steps) {
      value = await step(value);
    }
    return value;
  }
}

module.exports = Pipeline;
```

## Explanation

### Issue 1: `static` field shared across all instances

**Problem:** Every `Pipeline` instance reads and writes the same `steps` array. After the first request adds steps and runs, those steps remain in the array. The second request's `addStep` calls push onto the same array, so `run` replays steps from all prior requests on top of the new ones. Operators see output that looks like multiple transformations were applied, or functions from request 1 execute against request 2's data.

**Fix:** Remove the `static` keyword from the field declaration, changing `static steps = [];` to `steps = [];` at the top of the class body.

**Explanation:** A `static` field belongs to the class constructor object itself — `Pipeline.steps` — not to any instance. When you write `this.steps.push(fn)`, JavaScript looks up the prototype chain and finds `Pipeline.steps`, so every instance mutates the same array. Removing `static` makes `steps` an instance field: the JavaScript runtime allocates a fresh `[]` for each `new Pipeline(...)` call, so one request's steps never bleed into another's. A related pitfall is using a `static` field intentionally as a cache or registry — that is fine, but it must be documented, because any mutation is global and persistent for the lifetime of the process.

---

### Issue 2: Duplicate class declaration in the same file

**Problem:** The file defines `class Pipeline` twice. The second definition overwrites the binding introduced by the first in the module scope, so the first class is never reachable by any code. This dead code makes it harder to understand which definition is in effect and can confuse static analysis tools or bundlers that expect unique top-level names.

**Fix:** Delete the entire first `class Pipeline { ... }` block, keeping only the corrected second definition that is actually exported via `module.exports = Pipeline;`.

**Explanation:** In JavaScript, a second `class` declaration with the same name in the same scope is legal (unlike `let`/`const`, which throw a `SyntaxError` on redeclaration) but the second binding simply replaces the first. Nothing references the first class after the second declaration, so it contributes no behavior — only noise. Leaving it in place means a future reader might edit the wrong block, thinking their change is live, and see no effect at runtime.
