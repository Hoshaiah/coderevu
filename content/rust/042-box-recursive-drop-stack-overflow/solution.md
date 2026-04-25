## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Deep Recursive Drop Overflows Stack
// ------------------------------------------------------------------------

pub enum Expr {
    Num(i64),
    Neg(Box<Expr>),
    Add(Box<Expr>, Box<Expr>),
}

// CHANGE 1: Add a custom iterative Drop impl so that dropping a deep Expr tree does not recurse through the call stack — instead we use a heap-allocated work stack (Vec) to drop children one level at a time.
impl Drop for Expr {
    fn drop(&mut self) {
        // Collect children that still need to be dropped onto an explicit stack.
        let mut stack: Vec<Box<Expr>> = Vec::new();

        // Pull out the immediate children of *self (replacing them with a
        // cheap leaf) so we own them and can push them onto the work stack.
        match self {
            Expr::Num(_) => return,
            Expr::Neg(inner) => {
                // CHANGE 1: swap the child out so we own it without recursing.
                let child = std::mem::replace(inner.as_mut(), Expr::Num(0));
                stack.push(Box::new(child));
            }
            Expr::Add(l, r) => {
                // CHANGE 1: swap both children out so we own them.
                let lc = std::mem::replace(l.as_mut(), Expr::Num(0));
                let rc = std::mem::replace(r.as_mut(), Expr::Num(0));
                stack.push(Box::new(lc));
                stack.push(Box::new(rc));
            }
        }

        // Iteratively drain the work stack; each iteration extracts a node's
        // children before the node itself is dropped (as a leaf Num(0)).
        while let Some(mut node) = stack.pop() {
            match node.as_mut() {
                Expr::Num(_) => {} // no children — just let `node` drop here.
                Expr::Neg(inner) => {
                    let child = std::mem::replace(inner.as_mut(), Expr::Num(0));
                    stack.push(Box::new(child));
                }
                Expr::Add(l, r) => {
                    let lc = std::mem::replace(l.as_mut(), Expr::Num(0));
                    let rc = std::mem::replace(r.as_mut(), Expr::Num(0));
                    stack.push(Box::new(lc));
                    stack.push(Box::new(rc));
                }
            }
            // `node` is now a tree of Num(0) leaves; dropping it is O(1) stack.
        }
    }
}

// CHANGE 2: Replace the recursive depth function with an iterative version using an explicit stack to avoid stack overflow on deep trees.
pub fn depth(expr: &Expr) -> usize {
    // Each entry is (node_ref, depth_of_this_node_so_far).
    let mut stack: Vec<(&Expr, usize)> = vec![(expr, 1)];
    let mut max_depth = 0usize;

    while let Some((node, d)) = stack.pop() {
        match node {
            Expr::Num(_) => {
                if d > max_depth {
                    max_depth = d;
                }
            }
            Expr::Neg(inner) => {
                stack.push((inner.as_ref(), d + 1));
            }
            Expr::Add(l, r) => {
                stack.push((l.as_ref(), d + 1));
                stack.push((r.as_ref(), d + 1));
            }
        }
    }

    max_depth
}
```

## Explanation

### Issue 1: Recursive drop overflows stack on deep trees

**Problem:** When an `Expr` tree with 100 000 levels of `Neg` nesting is freed, Rust's auto-generated drop glue calls `drop` on the `Box<Expr>` child, which calls `drop` on its child, and so on. Each level consumes one OS stack frame. On a typical system with ~8 MB of stack, this overflows somewhere between 10 000 and 100 000 levels, causing a segfault or SIGABRT that looks like a crash inside the allocator.

**Fix:** A custom `impl Drop for Expr` is added (CHANGE 1). Instead of letting Rust recurse, it swaps each child out with a cheap `Expr::Num(0)` leaf using `std::mem::replace`, pushes the real child onto a `Vec`-based work stack, and then loops until the work stack is empty. Each node's children are harvested before the node itself is dropped as a leaf, so no recursive calls occur.

**Explanation:** Rust's auto-drop for an enum containing `Box<T>` where `T` contains more `Box<T>` fields is strictly recursive: dropping the outer node means dropping the box, which drops the inner node, which drops its box, etc. By implementing `Drop` manually you intercept the drop before any child is visited. `std::mem::replace` lets you move the child out of the `Box` without requiring ownership of the `Box` itself — you leave a harmless `Num(0)` behind so the compiler-generated drop of the now-leaf node is O(1). The work `Vec` lives on the heap, so its growth is bounded only by available heap memory, not by stack depth. One related pitfall: because you provide a custom `Drop`, Rust will still run the generated drop glue for the fields *after* your `drop` body returns — but by then every real child has already been replaced with a `Num(0)` leaf, so the generated glue does nothing expensive.

---

### Issue 2: Recursive `depth` function overflows stack on deep trees

**Problem:** `depth` calls itself once per level of nesting. On the same 100 000-level `Neg` chain that triggers the drop overflow, `depth` will overflow the stack during the evaluation phase, long before the drop even happens. A user calling `depth` on a parsed deep expression gets a segfault with a backtrace full of `depth` frames.

**Fix:** The recursive `depth` function is replaced with an iterative version (CHANGE 2) that maintains a `Vec<(&Expr, usize)>` work stack. Each entry pairs a node reference with its accumulated depth. Leaf nodes update `max_depth`; interior nodes push their children with an incremented depth counter.

**Explanation:** Recursive traversal works by implicitly using the call stack to remember "where to go next". When the tree is deeper than the OS stack allows, the next recursive call writes past the stack guard page and the process is killed. The iterative rewrite makes the "where to go next" list explicit and heap-allocated, so depth is limited only by available heap. The logic is equivalent: for `Neg` there is one child pushed with `d + 1`; for `Add` both children are pushed; `Num` is a leaf and its depth is recorded. The final result is the maximum depth seen across all leaves, which matches the original definition.
