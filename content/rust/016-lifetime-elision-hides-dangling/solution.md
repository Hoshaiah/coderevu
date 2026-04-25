## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Elided Lifetime Ties Output to Wrong Input
// ------------------------------------------------------------------------

pub struct Tokenizer<'a> {
    source: &'a str,
    pos: usize,
}

impl<'a> Tokenizer<'a> {
    pub fn new(source: &'a str) -> Self {
        Tokenizer { source, pos: 0 }
    }

    // CHANGE 1: Return type now explicitly says `-> &'a str` instead of `-> &str`. This tells the compiler the slice lives as long as the source, not as long as &self.
    pub fn current_token(&self) -> &'a str {
        let end = self.source[self.pos..]
            .find(|c: char| c.is_whitespace())
            .map(|i| self.pos + i)
            .unwrap_or(self.source.len());
        &self.source[self.pos..end]
    }

    pub fn advance(&mut self, n: usize) {
        self.pos = (self.pos + n).min(self.source.len());
    }
}

// CHANGE 2: Add explicit lifetime `'a` so the compiler knows both returned slices borrow from `src`, not from the local `Tokenizer`.
pub fn first_two_tokens<'a>(src: &'a str) -> (&'a str, &'a str) {
    let mut t = Tokenizer::new(src);
    let first = t.current_token();
    t.advance(first.len() + 1);
    // Now valid: `first` is tied to `src`'s lifetime, not to `t`, so mutably reborrowing `t` is fine.
    let second = t.current_token();
    (first, second)
}
```

## Explanation

### Issue 1: Return lifetime tied to `&self` instead of `'a`

**Problem:** When `current_token` is written as `fn current_token(&self) -> &str`, Rust's lifetime elision rules produce `fn current_token<'b>(&'b self) -> &'b str`. The compiler concludes the returned slice can only live as long as the borrow of `self`, even though the slice actually points into `self.source` which has the longer lifetime `'a`. Callers see borrow-checker errors saying the `Tokenizer` is still borrowed when they try to call `advance`, forcing them to clone every token string.

**Fix:** Change the return type from `&str` to `&'a str` at the `current_token` method signature (CHANGE 1). This explicitly names the source lifetime as the return lifetime.

**Explanation:** Rust's elision rules exist to reduce annotation noise, but they apply a single rule mechanically: each elided lifetime in a return position is tied to the only input reference (here `&self`). That is wrong when the data being returned does not come from `self` itself but from something `self` holds a reference to with a different, longer lifetime. By writing `-> &'a str`, you tell the compiler "this slice's validity is governed by the `'a` lifetime parameter on the struct, which is the lifetime of the original source string". The borrow of `self` is then no longer relevant to the returned slice, so `t` can be mutably reborrowed via `advance` while `first` remains valid. A related pitfall: if you added a second `&str` input parameter to the method, elision would fail to compile rather than guess, which can be a helpful signal that explicit annotations are needed.

---

### Issue 2: Missing lifetime parameter on `first_two_tokens`

**Problem:** The original `first_two_tokens` lacks explicit lifetime annotations, so the compiler cannot directly see that the two returned `&str` slices both originate from the `src` parameter. Even after fixing the method, leaving the function signature un-annotated is a maintenance hazard: future readers cannot tell that the returned slices must not outlive `src`, and tooling like `clippy` may suggest incorrect simplifications.

**Fix:** Add the lifetime parameter `'a` to the function signature and annotate the input and both outputs as `'a`: `pub fn first_two_tokens<'a>(src: &'a str) -> (&'a str, &'a str)` (CHANGE 2).

**Explanation:** With the method fix in place the code compiles without explicit annotations on `first_two_tokens` because elision works correctly for a single input reference. However, making the lifetime explicit documents the contract: both returned slices are slices of `src` and must not outlive it. This matters to callers who might store the return value in a struct or pass it across a thread boundary. Without the annotation, a caller sees `(&str, &str)` and has no textual hint about provenance. Explicit annotations also prevent a subtle regression: if someone later adds a second `&str` parameter to the function, elision would tie the outputs to an arbitrary input rather than `src`, breaking call sites in non-obvious ways.
