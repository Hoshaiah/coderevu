---
slug: recursive-struct-without-indirection
track: rust
orderIndex: 22
title: Recursive Type Without Box
difficulty: easy
tags:
  - ownership
  - recursive-types
  - compiler-error
language: rust
---

## Context

This code is in `src/ast/expr.rs`, part of a simple expression evaluator. The `Expr` enum represents an arithmetic expression tree: literals, binary operations, and conditionals. The file is brand new and was written by a developer coming from a language (Python) where recursive data structures are implicit.

The code fails to compile with the error `recursive type Expr has infinite size`. The developer is confused because they see recursive enums used in blog posts all the time, but cannot figure out why theirs does not compile.

They tried adding `#[repr(C)]` and switching between `enum` and `struct`, neither of which helped. The fix is a single keyword applied to the recursive fields.

## Buggy code

```rust
// src/ast/expr.rs

#[derive(Debug, Clone)]
pub enum Expr {
    Lit(f64),
    Add(Expr, Expr),
    Mul(Expr, Expr),
    Neg(Expr),
    IfPos {
        cond: Expr,
        then: Expr,
        otherwise: Expr,
    },
}

impl Expr {
    pub fn eval(&self) -> f64 {
        match self {
            Expr::Lit(v) => *v,
            Expr::Add(a, b) => a.eval() + b.eval(),
            Expr::Mul(a, b) => a.eval() * b.eval(),
            Expr::Neg(e) => -e.eval(),
            Expr::IfPos { cond, then, otherwise } => {
                if cond.eval() > 0.0 { then.eval() } else { otherwise.eval() }
            }
        }
    }
}
```
