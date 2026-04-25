---
slug: rc-cycle-causes-leak
track: rust
orderIndex: 45
title: Rc Cycle Prevents Deallocation
difficulty: hard
tags:
  - ownership
  - memory
  - rc
language: rust
---

## Context

This module (`src/graph/node.rs`) implements a simple doubly-linked node for a graph structure. Each `Node` tracks its neighbors with `Rc<RefCell<Node>>` so that ownership can be shared. The `link` function establishes a bidirectional edge between two nodes.

A long-running graph-analysis service reports steadily growing memory usage. The leak correlates exactly with graph creation and teardown cycles. After each analysis pass the graph is dropped, but heap profilers show the `Node` allocations are never freed. Valgrind confirms the leak is in the graph module.

The team has verified that all public handles to the graph are dropped correctly. The leak is internal to the graph's reference-counted node structure.

## Buggy code

```rust
use std::rc::Rc;
use std::cell::RefCell;

pub struct Node {
    pub value: i32,
    // Bug: both forward and back edges are strong Rc references.
    // A <-> B creates a cycle: A holds Rc to B, B holds Rc to A.
    // Neither reference count ever reaches zero, so neither is freed.
    pub neighbors: Vec<Rc<RefCell<Node>>>,
}

impl Node {
    pub fn new(value: i32) -> Rc<RefCell<Self>> {
        Rc::new(RefCell::new(Node {
            value,
            neighbors: Vec::new(),
        }))
    }
}

pub fn link(a: &Rc<RefCell<Node>>, b: &Rc<RefCell<Node>>) {
    a.borrow_mut().neighbors.push(Rc::clone(b));
    b.borrow_mut().neighbors.push(Rc::clone(a));
}
```
