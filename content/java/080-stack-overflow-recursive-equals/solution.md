## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Recursive equals Causes Stack Overflow
// ------------------------------------------------------------------------

import java.util.Objects;

public class Category {
    private final String id;
    private final String name;
    private final Category parent;

    public Category(String id, String name, Category parent) {
        this.id = id;
        this.name = name;
        this.parent = parent;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Category)) return false;
        Category other = (Category) o;
        // CHANGE 1: Compare only id and name — identity is fully determined by id alone, so parent traversal is unnecessary and causes infinite recursion when a cycle exists.
        return Objects.equals(id, other.id)
            && Objects.equals(name, other.name);
    }

    @Override
    public int hashCode() {
        // CHANGE 2: Hash only id and name to match the updated equals contract and avoid recursive hashCode calls that also overflow when parent is cyclic.
        return Objects.hash(id, name);
    }
}
```

## Explanation

### Issue 1: Cyclic `parent` Reference in `equals`

**Problem:** When the CSV parser sets a `Category`'s `parent` field to itself, calling `equals` on that category enters an infinite chain: `Category.equals` calls `Objects.equals(parent, other.parent)`, which calls `Category.equals` again on the same object, repeating until the JVM exhausts its call stack and throws `StackOverflowError`. The stack trace showing hundreds of alternating `Category.equals` / `Objects.equals` frames is the direct symptom.

**Fix:** Remove `Objects.equals(parent, other.parent)` from the `equals` body so that equality is based solely on `id` and `name`. The updated `equals` at CHANGE 1 compares only those two fields.

**Explanation:** The original code assumed `parent` chains are acyclic, so each recursive call would eventually reach a `null` parent and terminate. A self-referential parent breaks that assumption: `this.parent == this`, so `Objects.equals(parent, other.parent)` resolves to `Objects.equals(this, this)`, which re-enters `equals` immediately. Removing `parent` from `equals` is safe because `id` already uniquely identifies a category in the catalog domain — two categories with the same `id` and `name` but different parents are the same logical entity loaded twice. A related pitfall: even without a direct self-loop, a two-node cycle (`A.parent = B`, `B.parent = A`) would cause the same infinite recursion, so fixing only the self-loop case is not enough; dropping parent from comparison is the right approach.

---

### Issue 2: Cyclic `parent` Reference in `hashCode`

**Problem:** `Objects.hash(id, name, parent)` calls `parent.hashCode()`, which calls `Objects.hash(id, name, parent)` on the parent, and so on. When a cycle exists, this also produces a `StackOverflowError`, and it happens before `equals` is even reached — for example, when inserting the category into a `HashSet`.

**Fix:** Replace `Objects.hash(id, name, parent)` with `Objects.hash(id, name)` at CHANGE 2, matching the fields now used in `equals`.

**Explanation:** The Java contract requires that objects that are `equals` must have the same `hashCode`. Since `equals` now ignores `parent`, `hashCode` must also ignore it; including `parent` in `hashCode` but not `equals` would violate the contract and cause missed deduplication in hash-based collections. Beyond correctness, dropping `parent` from `hashCode` eliminates the same recursive-descent problem: the hash computation no longer traverses the parent chain, so a cyclic `parent` no longer causes a stack overflow when the category is inserted into a `HashSet` or `HashMap`.
