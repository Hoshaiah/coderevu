## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Shared Mutable Default in getOrDefault
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TagAggregator {

    public Map<String, List<String>> buildIndex(List<Event> events) {
        Map<String, List<String>> index = new HashMap<>();
        // CHANGE 1: Removed the shared `empty` list; a fresh ArrayList is created per missing tag inside the loop so no two tags ever share the same list instance.

        for (Event event : events) {
            for (String tag : event.getTags()) {
                // CHANGE 2: Use computeIfAbsent instead of getOrDefault so a new, independent ArrayList is allocated only when the tag is not yet in the map, eliminating the shared-reference bug.
                List<String> ids = index.computeIfAbsent(tag, k -> new ArrayList<>());
                ids.add(event.getId());
            }
        }
        return index;
    }

    public static class Event {
        private final String id;
        private final List<String> tags;
        public Event(String id, List<String> tags) {
            this.id = id;
            this.tags = tags;
        }
        public String getId()          { return id; }
        public List<String> getTags()  { return tags; }
    }
}
```

## Explanation

### Issue 1: Shared mutable default list

**Problem:** Every call to `index.getOrDefault(tag, empty)` that finds no existing entry returns the *same* `ArrayList` object referenced by `empty`. Any `ids.add(...)` call mutates that single shared list. As more tags are processed and each one that was absent gets the `empty` default, they all end up pointing to — and writing into — the same growing list. The report then shows event IDs under tags they were never associated with.

**Fix:** Remove the single `empty` variable entirely. Replace `getOrDefault(tag, empty)` with `index.computeIfAbsent(tag, k -> new ArrayList<>())` (CHANGE 2), which creates a fresh `ArrayList` on first access and stores it in the map atomically, so each tag gets its own independent list.

**Explanation:** `getOrDefault` is a read-only lookup — it never inserts the default value into the map. So when tag `"alpha"` is first seen, `getOrDefault` returns `empty`, you add an ID to `empty`, and then `index.put("alpha", empty)` stores `empty` under `"alpha"`. Now when tag `"beta"` is first seen, `getOrDefault` again returns `empty` (because `"beta"` is still absent), you add another ID to `empty`, and call `index.put("beta", empty)`. At this point both `"alpha"` and `"beta"` map to the *same list object*, which already contains both IDs. `computeIfAbsent` fixes this because it inserts the newly created list into the map before returning it, so the next absent tag gets a different lambda invocation and a different list. The `index.put` call after `add` is also now unnecessary and removed, since `computeIfAbsent` already stored the list reference.

---

### Issue 2: Redundant `index.put` after mutating the returned list

**Problem:** In the original code, after mutating `ids` the code calls `index.put(tag, ids)` on every iteration, even when `ids` was already the list stored in the map (i.e., the tag was present). This is harmless for correctness on its own, but it papers over the fact that the real problem is upstream in how the list is obtained.

**Fix:** With `computeIfAbsent` (CHANGE 2), the returned list is already in the map, so the explicit `index.put(tag, ids)` line is removed entirely. Mutating `ids` directly updates the list already stored in the map.

**Explanation:** `computeIfAbsent` returns the existing value if the key is present, or inserts and returns the newly created value if absent. Either way the returned list *is* the list in the map, so calling `add` on it is sufficient — no `put` is needed. Keeping an unnecessary `put` would still be correct with `computeIfAbsent`, but removing it makes the intent clearer and avoids redundant hash lookups. A related pitfall: if you use `getOrDefault` with a per-call `new ArrayList<>()` as the default (a common attempted fix), you still need the `put` because `getOrDefault` does not insert — `computeIfAbsent` is the right tool precisely because it collapses lookup-and-insert into one atomic step.
