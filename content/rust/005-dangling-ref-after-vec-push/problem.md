---
slug: dangling-ref-after-vec-push
track: rust
orderIndex: 5
title: Reference Invalidated by Vec Reallocation
difficulty: medium
tags:
  - borrowing
  - ownership
  - unsafe
language: rust
---

## Context

This code appears in `src/intern.rs`, a simple string interner used by a compiler front-end. The idea is to store all interned strings in a `Vec<String>` and hand out `&str` references that are supposed to remain valid for the lifetime of the interner. A raw-pointer trick is used to sidestep the borrow checker.

In practice, the returned `&str` references silently point to garbage after enough strings have been interned, causing the compiler to produce corrupted symbol names or segfault. The bug is hard to reproduce in unit tests because it only triggers once the internal Vec reallocates.

The team identified that the unsafe block is involved but hasn't pinpointed the exact problem. Miri flags this as undefined behaviour on the first reallocation.

## Buggy code

```rust
pub struct Interner {
    storage: Vec<String>,
}

impl Interner {
    pub fn new() -> Self {
        Interner { storage: Vec::new() }
    }

    /// Returns a reference that is supposed to live as long as the Interner.
    pub fn intern(&mut self, s: &str) -> &str {
        for existing in &self.storage {
            if existing == s {
                // SAFETY: claimed — storage is never mutated after insertion.
                return unsafe { &*(existing.as_str() as *const str) };
            }
        }
        self.storage.push(s.to_owned());
        let inserted: &String = self.storage.last().unwrap();
        unsafe { &*(inserted.as_str() as *const str) }
    }
}
```
