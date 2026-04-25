## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Partial Move Breaks Struct Access
// ------------------------------------------------------------------------

pub struct Record {
    pub id: u64,
    pub name: String,
}

// CHANGE 2: destructure `record` in a single pattern instead of moving fields out one by one; clearer ownership, same result.
pub fn into_parts(record: Record) -> (u64, String) {
    let Record { id, name } = record;
    (id, name)
}

pub fn archive_record(record: Record) {
    // CHANGE 1: capture `record.id` before consuming `record` with `into_parts`, so the value is available after the move.
    let original_id = record.id;
    let (id, name) = into_parts(record);
    println!("archived id={} name={}", id, name);
    println!("original id was {}", original_id);
}
```

## Explanation

### Issue 1: Use-after-move of consumed struct

**Problem:** `into_parts(record)` takes `record` by value, transferring full ownership into the function. After that call returns, `record` no longer exists in `archive_record`, so the compiler rejects `record.id` on the next line with "use of moved value".

**Fix:** Add `let original_id = record.id;` before the call to `into_parts(record)`. Because `id` is `u64` (a `Copy` type), reading it beforehand copies the value cheaply and stores it in `original_id`, which remains valid after `record` is consumed.

**Explanation:** Rust's ownership rules mean a value can have exactly one owner at a time. Passing `record` to `into_parts` by value transfers that ownership; the caller can no longer touch any field of `record` regardless of whether those fields were individually moved or not. Since `u64` implements `Copy`, accessing `record.id` before the call performs a bit-copy rather than a move, leaving `record` still fully owned by `archive_record` until it is passed to `into_parts`. A related pitfall: if `id` were a `String` instead of `u64`, you would need to clone it first, because reading a non-`Copy` field would itself partially move the struct.

---

### Issue 2: Manual field extraction instead of destructuring

**Problem:** `into_parts` moves `record.name` first, which partially moves the struct, and then reads `record.id`. While the compiler permits this specific order today, the pattern is fragile: swapping the two lines would compile fine but the intent is hidden, and it makes it easy to accidentally reference the partially-moved struct elsewhere in the function body.

**Fix:** Replace the two separate `let` bindings with a single destructuring pattern `let Record { id, name } = record;`. This makes the complete consumption of `record` explicit and atomic in one statement.

**Explanation:** When you write `let name = record.name;`, Rust tracks that `name` has been moved out of `record` but `id` has not — this is a "partial move". The struct `record` is then in a limbo state: you can still read `record.id` but you cannot use `record` as a whole. Destructuring with `let Record { id, name } = record;` moves all fields simultaneously and unambiguously, and the compiler can enforce that `record` is never referenced again as a unit. It also communicates intent: a reader immediately sees that the whole struct is being taken apart, not just one field at a time.
