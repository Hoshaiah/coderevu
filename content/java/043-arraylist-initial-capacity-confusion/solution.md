## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — ArrayList Constructor Misused for Copies
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;

public class EventBatch {
    private final List<String> events;

    public EventBatch(List<String> events) {
        // CHANGE 2: copy the incoming list immediately so external mutations after construction cannot affect this object's state.
        this.events = new ArrayList<>(events);
    }

    public List<String> defensiveCopy() {
        // CHANGE 1: pass the collection itself, not events.size(), so the copy actually contains the elements.
        return new ArrayList<>(events);
    }

    public int size() {
        return events.size();
    }
}
```

## Explanation

### Issue 1: Wrong Argument to ArrayList Constructor

**Problem:** `defensiveCopy()` returns an empty list every time, even when `events` has elements. Any downstream code that iterates or reads the returned list silently processes nothing.

**Fix:** Replace `new ArrayList<>(events.size())` with `new ArrayList<>(events)` at the CHANGE 1 site. The single-argument `ArrayList(Collection)` constructor copies all elements; the single-argument `ArrayList(int)` constructor only pre-allocates capacity.

**Explanation:** `ArrayList` has two single-argument constructors: one accepts an `int` initial capacity and one accepts a `Collection` to copy. When you write `new ArrayList<>(events.size())`, Java resolves the call to the `int` overload because `events.size()` returns a primitive `int`. The result is an empty list sized to hold that many elements — none are added. Passing `events` (the `List<String>` itself) instead selects the `Collection` overload, which iterates the source and adds every element. A related pitfall: if `events` is empty, both calls produce an empty list, which is why this bug is invisible in tests that only check the size-zero case.

---

### Issue 2: Constructor Stores Mutable Reference Instead of Copying

**Problem:** If a caller passes a `List` to `EventBatch` and later mutates that list (adds, removes, or clears elements), the `events` field inside `EventBatch` reflects those changes. This defeats the purpose of the class holding a stable snapshot of events.

**Fix:** At the CHANGE 2 site, replace `this.events = events` with `this.events = new ArrayList<>(events)`. This copies all elements at construction time so the stored list is independent of the caller's reference.

**Explanation:** Java assigns object references, not values. Storing `events` directly means `this.events` and the caller's variable point at the same heap object. Any structural change the caller makes — or that `defensiveCopy()`'s consumer makes if it somehow gets hold of the original — is visible inside `EventBatch`. Copying in the constructor creates a separate `ArrayList` backed by the same `String` objects (strings are immutable, so shallow copy is fine here). After that point, the caller can clear their list without affecting `EventBatch`. One related pitfall: if the element type were a mutable object instead of `String`, a shallow copy would still leave the elements themselves shared; a deep copy would then be needed.
