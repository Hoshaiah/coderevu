## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Lazy Iterator Side Effects Never Run
// ------------------------------------------------------------------------

// Simplified: pretend `pipeline` is a Redis pipeline that queues commands.
pub struct Pipeline {
    commands: Vec<String>,
}

impl Pipeline {
    pub fn incr(&mut self, key: &str) {
        self.commands.push(format!("INCR {}", key));
    }

    pub fn commands(&self) -> &[String] {
        &self.commands
    }
}

pub fn record_metrics(pipeline: &mut Pipeline, keys: &[&str]) {
    // CHANGE 1+2: Replace `map` (lazy, returns an unconsumed iterator) with `for_each` (eager, executes the closure immediately for every element), which both drives the iterator to completion and correctly expresses intent for a side-effecting operation.
    keys.iter().for_each(|key| pipeline.incr(key));
}
```

## Explanation

### Issue 1: Lazy iterator never consumed

**Problem:** `keys.iter().map(|key| pipeline.incr(key))` builds an iterator adapter but nothing iterates it. The closure body — the `pipeline.incr(key)` call — executes only when an element is pulled from the iterator. Because the return value of `map` is immediately dropped, zero elements are pulled, zero closures run, and zero commands are queued. Redis counters stay at zero indefinitely, and no error or warning is produced.

**Fix:** Replace `map(|key| pipeline.incr(key))` with `for_each(|key| pipeline.incr(key))`. `for_each` is a terminal (consuming) operation that drives the iterator to completion inline, so the closure runs once per element before `record_metrics` returns.

**Explanation:** Rust's iterator adapters (`map`, `filter`, `flat_map`, etc.) are lazy: calling them returns a new iterator struct but does no work. Work happens only when something pulls elements — a `for` loop, `collect`, `count`, `for_each`, or another consumer. Here, `map` returns a `Map<Iter<&str>, _>` value that is bound to nothing and immediately dropped. The compiler even warns about this with "unused `Map` that must be used" if warnings are enabled, though it is easy to miss. Replacing `map` with `for_each` makes the call site its own consumer, so no separate terminal step is needed.

---

### Issue 2: map used for side effects instead of for_each

**Problem:** Even if a terminal like `.count()` were appended to fix the laziness, using `map` to queue Redis commands would be misleading. `map` is designed to transform each element into a new value; the resulting iterator of `()` return values would exist only to be discarded. Any reviewer reading the code would expect `map` to be producing something useful, not firing I/O.

**Fix:** The same replacement — `for_each(|key| pipeline.incr(key))` — also fixes this semantic issue. `for_each` communicates clearly that the purpose of the iteration is to perform an action on each element, not to produce a new collection.

**Explanation:** `Iterator::for_each` was added to the standard library precisely to replace the `map(...).count()` or `.collect::<Vec<_>>()` workarounds people used to force lazy iterators to run for side effects. It signals intent: "visit every element and do something with it." Using `map` for side effects also risks subtle bugs in the future — for example, if someone wraps the call in a `filter` or `take`, they might not realize they are suppressing some of the side effects, whereas `for_each` makes it obvious that every matched element triggers an action.
