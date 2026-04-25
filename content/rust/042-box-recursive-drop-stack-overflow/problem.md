---
slug: box-recursive-drop-stack-overflow
track: rust
orderIndex: 42
title: Deep Recursive Drop Overflows Stack
difficulty: hard
tags:
  - ownership
  - drop
  - recursion
language: rust
---

## Context

This code is in `src/ast/node.rs`. The compiler front-end builds an abstract syntax tree where each node owns its children via `Box`. After parsing a deeply nested expression (think a chain of 100 000 negations like `----...----x`), the AST is dropped at the end of a compilation unit.

The process occasionally crashes with a stack overflow during the drop phase, not during parsing or evaluation. `RUST_BACKTRACE=1` shows the stack is dominated by `<Expr as Drop>::drop` calls, each recursively dropping a child. The nesting depth matches the depth of the input expression.

The developer already ruled out allocator issues and confirmed the crash never happens on shallow inputs (depth < 10 000). The problem is that Rust's default drop for recursive types recurses into child nodes, consuming one stack frame per level.

## Buggy code

```rust
pub enum Expr {
    Num(i64),
    Neg(Box<Expr>),
    Add(Box<Expr>, Box<Expr>),
}

// No custom Drop impl — Rust drops children recursively by default.

pub fn depth(expr: &Expr) -> usize {
    match expr {
        Expr::Num(_) => 1,
        Expr::Neg(inner) => 1 + depth(inner),
        Expr::Add(l, r) => 1 + depth(l).max(depth(r)),
    }
}
```
