## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Stale Index After Vec Reallocation
// ------------------------------------------------------------------------

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
        // CHANGE 1: Record child_idx first, then push — no raw pointer needed. After the push, the Vec may have reallocated, so we re-index by parent_idx (a plain usize) instead of a pointer captured before the push.
        let child_idx = self.nodes.len();
        self.nodes.push(Node { data: child_data, children: Vec::new() });
        // CHANGE 2: Use safe indexing by parent_idx after the push, removing the unsound raw-pointer dereference entirely.
        self.nodes[parent_idx].children.push(child_idx);
        child_idx
    }
}
```

## Explanation

### Issue 1: Raw pointer invalidated by Vec reallocation

**Problem:** In `add_child`, a raw pointer to `self.nodes[parent_idx]` is captured before `self.nodes.push(...)` is called. When `push` causes the `Vec` to grow, it allocates a new backing buffer, copies all elements there, and frees the old buffer. The raw pointer now points into freed memory. The subsequent `(*parent_ptr).children.push(child_idx)` is a use-after-free. MIRI and Valgrind catch it; release builds with large graphs silently corrupt the child list because the old memory may have been reused.

**Fix:** Remove the raw pointer entirely. After the `push`, re-access the parent through `self.nodes[parent_idx]` — a safe, bounds-checked index into the (possibly relocated) backing buffer. See the `CHANGE 1` and `CHANGE 2` sites.

**Explanation:** A `Vec` stores its data on the heap at an address that can change on every reallocation. Taking `&mut self.nodes[parent_idx]` gives a reference (or raw pointer) that is only valid as long as no reallocation happens. `push` triggers a reallocation whenever `len == capacity`. In debug builds the initial capacity might be large enough that the push never reallocates, so the bug is latent; in release builds with many nodes the capacity is exhausted and the old buffer is freed mid-function. Using an index (`usize`) instead of a pointer is safe because the index remains valid regardless of where the backing buffer lives after reallocation.

---

### Issue 2: Unnecessary unsafe block masks unsound code

**Problem:** The `unsafe` block around `(*parent_ptr).children.push(child_idx)` silences the borrow checker and hides a memory-safety violation. The safety comment "parent_ptr still valid... right?" signals that the author was uncertain, yet the `unsafe` keyword tells the compiler to trust the code anyway.

**Fix:** Delete the `unsafe` block and replace the raw-pointer dereference with the safe index expression `self.nodes[parent_idx].children.push(child_idx)` at the `CHANGE 2` site. The borrow checker accepts this because the shared mutable borrow of `self.nodes` from the earlier `push` call has already ended.

**Explanation:** The original motivation for `unsafe` was that the compiler rejects holding a `&mut Node` reference at the same time as calling `self.nodes.push` (which also borrows `self.nodes` mutably). The author "solved" this by escaping to raw pointers, but that only moves the problem outside the borrow checker's view — it does not actually make the code safe. The correct solution is to sequence the operations: push first (ending any borrow of `self.nodes`), then index into `self.nodes` again. The borrow checker permits two separate, non-overlapping borrows of the same `Vec`, so no `unsafe` is needed at all.
