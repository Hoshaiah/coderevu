## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Recursive Type Without Box
// ------------------------------------------------------------------------

// src/ast/expr.rs

#[derive(Debug, Clone)]
pub enum Expr {
    Lit(f64),
    // CHANGE 1: wrap each recursive Expr in Box<> so the variant holds a pointer (known size) instead of the value itself.
    Add(Box<Expr>, Box<Expr>),
    // CHANGE 1: same fix for Mul — both operands must be heap-allocated.
    Mul(Box<Expr>, Box<Expr>),
    // CHANGE 1: same fix for Neg — the single operand must be heap-allocated.
    Neg(Box<Expr>),
    // CHANGE 2: same fix for all three struct-style fields in IfPos — each must be Box<Expr>.
    IfPos {
        cond: Box<Expr>,
        then: Box<Expr>,
        otherwise: Box<Expr>,
    },
}

impl Expr {
    pub fn eval(&self) -> f64 {
        match self {
            Expr::Lit(v) => *v,
            // CHANGE 1: deref the Box transparently via auto-deref; eval() call is unchanged.
            Expr::Add(a, b) => a.eval() + b.eval(),
            Expr::Mul(a, b) => a.eval() * b.eval(),
            Expr::Neg(e) => -e.eval(),
            // CHANGE 2: auto-deref makes the eval() calls on Box<Expr> work identically.
            Expr::IfPos { cond, then, otherwise } => {
                if cond.eval() > 0.0 { then.eval() } else { otherwise.eval() }
            }
        }
    }
}
```

## Explanation

### Issue 1: Recursive tuple variants have infinite size

**Problem:** The compiler rejects the enum with `recursive type Expr has infinite size`. Variants like `Add(Expr, Expr)` ask the compiler to lay out an `Expr` value inside another `Expr` value, creating a layout that would require infinite bytes.

**Fix:** Change every tuple-variant recursive field from `Expr` to `Box<Expr>`. Concretely, `Add(Expr, Expr)` becomes `Add(Box<Expr>, Box<Expr>)`, and the same change applies to `Mul` and `Neg`.

**Explanation:** Rust must know the size of every type at compile time. When `Expr::Add` contains two `Expr` fields, computing the size of `Expr` requires knowing the size of `Expr` — an impossible cycle. `Box<Expr>` is a heap pointer, which is always exactly one pointer-width regardless of what it points to, so the cycle breaks. The `eval()` method needs no change because Rust's auto-deref coercion lets you call methods on `Box<T>` as if they were on `T` directly.

---

### Issue 2: Struct-style variant fields also embed Expr directly

**Problem:** The `IfPos` variant uses named fields (`cond: Expr`, `then: Expr`, `otherwise: Expr`). These suffer the same infinite-size problem as the tuple variants — even though they look different syntactically, the memory layout issue is identical.

**Fix:** Change all three named fields in `IfPos` from `Expr` to `Box<Expr>`: `cond: Box<Expr>`, `then: Box<Expr>`, `otherwise: Box<Expr>`.

**Explanation:** Rust does not distinguish between tuple-style and struct-style variant fields when computing type layout — both require the inner type's size to be known. A single `cond: Expr` field is enough to make the entire enum infinitely sized. Wrapping each in `Box<Expr>` stores only a pointer in the variant. The `match` arm in `eval()` still pattern-matches on the field names unchanged, because `Box<T>` implements `Deref<Target = T>` and method calls go through it transparently.
