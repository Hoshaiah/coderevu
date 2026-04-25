## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Mutable and Shared Borrow of Struct
// ------------------------------------------------------------------------

use std::collections::HashSet;

pub struct Processor {
    pub buffer: Vec<String>,
    pub seen: HashSet<String>,
}

impl Processor {
    pub fn process_next(&mut self, key: String, value: String) {
        // CHANGE 2: pass seen by &mut and buffer by & separately to avoid whole-struct &mut borrow
        let is_new = Self::check_and_insert(&mut self.seen, &self.buffer, &key);
        if is_new {
            self.buffer.push(format!("{}: {}", key, value));
        }
    }

    // CHANGE 2: accept only the fields actually needed; no longer takes &mut self so callers can hold other borrows simultaneously
    fn check_and_insert(seen: &mut HashSet<String>, buffer: &Vec<String>, key: &str) -> bool {
        if seen.contains(key) {
            return false;
        }
        seen.insert(key.to_owned());
        // Reading buffer length is fine; buffer is a shared borrow independent of seen
        let _len = buffer.len();
        true
    }

    pub fn flush(&mut self) -> Vec<String> {
        // CHANGE 1: collect owned data first, then clear; eliminates the dangling shared-ref borrow conflict
        let result = self.buffer.clone();
        self.buffer.clear();
        result
    }
}
```

## Explanation

### Issue 1: `flush` borrows then mutates `buffer`

**Problem:** `flush` stores `let result = &self.buffer` — a shared reference into `self.buffer` — and then calls `self.buffer.clear()` on the very next line. The compiler rejects this because `clear` requires `&mut self.buffer`, which cannot coexist with the live shared reference `result`. The function never compiles.

**Fix:** Replace the shared-reference assignment with `self.buffer.clone()` to get an owned `Vec<String>`, then call `self.buffer.clear()`. The variable `result` is returned directly without any trailing `.to_vec()` call.

**Explanation:** Rust's borrow rules forbid a mutable borrow while any other borrow of the same value is alive. `result` keeps `self.buffer` borrowed until `result` goes out of scope, but `self.buffer.clear()` needs exclusive access before that scope ends. Cloning produces a fully independent `Vec` so the original can be cleared freely. The cost is one allocation per flush, but `flush` is a low-frequency drain operation, not the per-record hot path, so this is acceptable. The previous `.to_vec()` on a `&Vec<String>` was redundant anyway — `clone()` on a `Vec` does the same thing more directly.

---

### Issue 2: `check_and_insert` takes `&mut self` instead of individual field borrows

**Problem:** `check_and_insert` only reads `self.buffer` and mutates `self.seen`, but because it takes `&mut self`, any call to it exclusively locks the entire `Processor`. This means the compiler cannot allow `process_next` to pass `key` (a field of the caller's logic) while the method is live, and it prevents future callers from holding any other borrow on the struct simultaneously. In the current code this is a latent design hazard that blocks split-borrow patterns.

**Fix:** Change `check_and_insert` from an instance method taking `&mut self` to a free-standing associated function (still on `impl Processor`) that takes `seen: &mut HashSet<String>` and `buffer: &Vec<String>` as separate parameters. The call site in `process_next` becomes `Self::check_and_insert(&mut self.seen, &self.buffer, &key)`.

**Explanation:** Rust's borrow checker tracks borrows at the field level when fields are accessed directly at the call site, but it cannot see inside a method signature to realize only one field is mutated — it must conservatively lock all of `self`. By splitting the borrow at the call site (`&mut self.seen` and `&self.buffer`), the compiler can verify they are disjoint and permit both simultaneously. This also removes the need for a `key.clone()` that the teammate suggested, since `key` is a local `String` in `process_next` and its `&str` slice can be passed without cloning. The zero-allocation path is preserved on the 200k/s hot loop.
