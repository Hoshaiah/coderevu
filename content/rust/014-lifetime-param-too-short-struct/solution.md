## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Struct Lifetime Shorter Than Field
// ------------------------------------------------------------------------

pub struct Config {
    pub max_stages: usize,
}

// CHANGE 1: Added `'b: 'a` bound to express that the config reference must live at least as long as the input reference, giving the compiler the proof it needs.
pub struct PipelineContext<'a, 'b: 'a> {
    pub input: &'a [u8],
    pub config: &'b Config,
}

// CHANGE 2: Propagated the `'b: 'a` bound onto the impl block so that sub_context can return PipelineContext<'a, 'b> without a lifetime error.
impl<'a, 'b: 'a> PipelineContext<'a, 'b> {
    pub fn new(input: &'a [u8], config: &'b Config) -> Self {
        PipelineContext { input, config }
    }

    // Returns a sub-context that views a slice of the current input.
    pub fn sub_context(&self, range: std::ops::Range<usize>) -> PipelineContext<'a, 'b> {
        PipelineContext {
            input: &self.input[range],
            config: self.config,
        }
    }
}

// CHANGE 2: Same bound added here so that the free function signature is consistent with the struct's new constraint.
pub fn first_stage<'a, 'b: 'a>(ctx: &PipelineContext<'a, 'b>) -> PipelineContext<'a, 'b> {
    // This compiles because both lifetimes flow through from ctx.
    ctx.sub_context(0..ctx.input.len() / 2)
}
```

## Explanation

### Issue 1: Missing `'b: 'a` bound on struct definition

**Problem:** `PipelineContext<'a, 'b>` holds `input: &'a [u8]` and `config: &'b Config`, but the two lifetimes are declared with no relationship. When `sub_context` tries to return a `PipelineContext<'a, 'b>` that borrows `self.config`, the compiler cannot confirm that `'b` (the config reference) will remain valid for at least as long as `'a` (the input reference). Call sites that actually use the returned context see a lifetime error even though the data is logically fine.

**Fix:** Add `'b: 'a` as a bound directly on the struct declaration: `pub struct PipelineContext<'a, 'b: 'a>`. This single token change tells the compiler that any `'b` supplied here must outlive `'a`.

**Explanation:** Rust's borrow checker treats two lifetime parameters as entirely independent unless told otherwise. Without `'b: 'a`, the compiler has no warrant to assume `'b` covers the span of `'a`, so it rejects any code that hands back a value containing both. Adding `'b: 'a` is a subtyping constraint: a `&'b Config` is a valid `&'a Config` whenever `'b` outlives `'a`, which is exactly what you need when the same config reference is embedded in a struct alongside a shorter-lived slice. A related pitfall: if you later add a third lifetime `'c` for, say, a scratch buffer, you may need `'b: 'c` as well, depending on how stages use it.

---

### Issue 2: Bound missing from `impl` block and free function

**Problem:** Even after fixing the struct, the `impl<'a, 'b>` block and `first_stage<'a, 'b>` are still written without the `'b: 'a` constraint. The compiler requires that wherever `PipelineContext<'a, 'b: 'a>` appears, the surrounding generic context must reproduce the same bound; otherwise the impl or function would be able to instantiate the struct with lifetimes that violate the struct's own invariant.

**Fix:** Change both `impl<'a, 'b>` to `impl<'a, 'b: 'a>` and `fn first_stage<'a, 'b>` to `fn first_stage<'a, 'b: 'a>`. These additions mirror the bound declared on the struct.

**Explanation:** In Rust, when a generic item (impl block, function, another struct) uses a type that carries lifetime bounds, it must re-state those bounds in its own parameter list. The struct definition says "I can only exist when `'b` outlives `'a`", but an unconstrained `impl<'a, 'b>` block tries to be valid for all `'a` and `'b`, including pairs that violate that rule. The compiler rejects this inconsistency. Writing `impl<'a, 'b: 'a>` closes the gap: the impl is now only valid for the same universe of lifetime pairs that the struct itself accepts, so everything is consistent and `sub_context` compiles without error.
