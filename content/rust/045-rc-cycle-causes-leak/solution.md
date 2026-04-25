## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Rc Cycle Prevents Deallocation
// ------------------------------------------------------------------------

use std::rc::Rc;
use std::rc::Weak;
use std::cell::RefCell;

pub struct Node {
    pub value: i32,
    // CHANGE 2: Split neighbors into strong forward edges and weak back-edges so the graph owns children but does not form ownership cycles.
    pub neighbors: Vec<Rc<RefCell<Node>>>,
    pub back_neighbors: Vec<Weak<RefCell<Node>>>,
}

impl Node {
    pub fn new(value: i32) -> Rc<RefCell<Self>> {
        Rc::new(RefCell::new(Node {
            value,
            neighbors: Vec::new(),
            back_neighbors: Vec::new(),
        }))
    }
}

pub fn link(a: &Rc<RefCell<Node>>, b: &Rc<RefCell<Node>>) {
    // CHANGE 1: a holds a strong Rc to b (forward edge), b holds only a Weak to a (back-edge) so the cycle is broken and both nodes can be freed when the caller drops its handles.
    a.borrow_mut().neighbors.push(Rc::clone(b));
    b.borrow_mut().back_neighbors.push(Rc::downgrade(a));
}
```

## Explanation

### Issue 1: Strong Rc cycle prevents deallocation

**Problem:** After every analysis pass the graph is dropped, but heap profilers and Valgrind show that every `Node` allocation leaks. Memory usage grows without bound across analysis cycles.

**Fix:** In `link`, replace the second `Rc::clone(a)` push into `neighbors` with `Rc::downgrade(a)` pushed into a new `back_neighbors: Vec<Weak<RefCell<Node>>>` field. The forward edge (`a → b`) stays a strong `Rc`; the reverse edge (`b → a`) becomes a `Weak`.

**Explanation:** `Rc` tracks how many strong pointers refer to an allocation and frees it only when that count hits zero. When `link(a, b)` runs, `a`'s strong count goes up because `b.neighbors` holds an `Rc` to it, and `b`'s strong count goes up because `a.neighbors` holds an `Rc` to it. When the caller drops its own handles the counts drop from 2 to 1, not to 0, so neither node is freed. `Weak` does not increment the strong count, so the caller's drop brings `a`'s strong count to 0, which frees `a`, which drops its `Rc` to `b`, which brings `b`'s strong count to 0 and frees `b`. A related pitfall: if you need to traverse back-edges at runtime you must call `Weak::upgrade` and handle the `None` case, because a weak pointer can dangle if the target was freed through another path.

---

### Issue 2: neighbors field has no Weak capacity, forcing a structural change

**Problem:** The original `Node` struct has only one `neighbors: Vec<Rc<RefCell<Node>>>` field. Storing a `Weak` back-reference requires a place to put it; without a separate field the type system offers no way to mix strong and weak edges.

**Fix:** Add `pub back_neighbors: Vec<Weak<RefCell<Node>>>` to `Node` and initialise it to `Vec::new()` in `Node::new`. The `link` function then pushes into `back_neighbors` for the reverse direction instead of into `neighbors`.

**Explanation:** `Rc<T>` and `Weak<T>` are different types in Rust; a `Vec<Rc<...>>` cannot hold a `Weak<...>` value. Introducing a dedicated `back_neighbors` vec keeps the type split explicit and makes the intent clear to future readers: `neighbors` are owned children, `back_neighbors` are non-owning references back to parents or peers. Callers that only traversed `neighbors` are unaffected; callers that need reverse traversal use `back_neighbors` with `Weak::upgrade`. If the graph is undirected and you do not care about direction, an alternative is to always push the `Weak` into both sides and keep only one `neighbors` field typed as `Vec<Weak<...>>`, letting the caller retain the sole strong `Rc` for each node — but that shifts lifetime management responsibility to the caller entirely.
