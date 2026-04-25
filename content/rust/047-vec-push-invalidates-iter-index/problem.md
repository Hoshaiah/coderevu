---
slug: vec-push-invalidates-iter-index
track: rust
orderIndex: 47
title: Stale Index After Vec Reallocation
difficulty: hard
tags:
  - ownership
  - unsafe
  - memory-safety
language: rust
---

## Context

This code is in `src/graph/arena.rs`, a simple arena allocator for graph nodes used by a compiler pass. Each node is stored in a `Vec<Node>`, and the `add_child` method takes the index of a parent node and the data for a new child node, pushes the child onto the arena, and then writes the child's index into the parent's child list.

The function uses `unsafe` to get a raw pointer to the parent before pushing the child, in order to avoid a borrow-checker complaint. In debug builds everything works. In release builds with large graphs, the graph is occasionally corrupt: parent nodes point to wrong children, and the compiler pass produces incorrect output.

Valgrind and MIRI both flag a use-after-free on the pointer dereference.

## Buggy code

```rust
pub struct Node {
    pub data: u32,
    pub children: Vec<usize>,
}

pub struct Arena {
    nodes: Vec<Node>,
}

impl Arena {
    pub fn new() -> Self {
        Arena { nodes: Vec::new() }
    }

    pub fn add_node(&mut self, data: u32) -> usize {
        let idx = self.nodes.len();
        self.nodes.push(Node { data, children: Vec::new() });
        idx
    }

    pub fn add_child(&mut self, parent_idx: usize, child_data: u32) -> usize {
        // Get a raw pointer to parent to avoid borrow conflict
        let parent_ptr: *mut Node = &mut self.nodes[parent_idx];
        // Push the child; this may reallocate self.nodes
        let child_idx = self.nodes.len();
        self.nodes.push(Node { data: child_data, children: Vec::new() });
        // SAFETY: parent_ptr still valid... right?
        unsafe {
            (*parent_ptr).children.push(child_idx);
        }
        child_idx
    }
}
```
