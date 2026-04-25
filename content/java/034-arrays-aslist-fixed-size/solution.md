## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Arrays.asList Returns Fixed-Size List
// ------------------------------------------------------------------------

import java.util.Arrays;
import java.util.ArrayList;
import java.util.List;

public class FeatureFlags {
    private List<String> enabled;

    public FeatureFlags(String csv) {
        String[] parts = csv.split(",");
        // CHANGE 1: Wrap Arrays.asList in a new ArrayList so the list supports add/remove at runtime; Arrays.asList returns a fixed-size view that throws UnsupportedOperationException on structural mutations.
        // CHANGE 2: Filter out blank entries so an empty or whitespace-only CSV does not seed the list with a spurious empty-string flag.
        enabled = new ArrayList<>();
        for (String part : parts) {
            if (!part.trim().isEmpty()) {
                enabled.add(part.trim());
            }
        }
    }

    public void enable(String flag) {
        enabled.add(flag);
    }

    public void disable(String flag) {
        enabled.remove(flag);
    }

    public boolean isEnabled(String flag) {
        return enabled.contains(flag);
    }
}
```

## Explanation

### Issue 1: Fixed-Size List From Arrays.asList

**Problem:** When the admin API calls `enable()`, the `add()` call throws `java.lang.UnsupportedOperationException`. The service starts without error, so the problem only appears at runtime when the list is first mutated.

**Fix:** Replace `enabled = Arrays.asList(parts)` with a loop that populates a `new ArrayList<>()`, as shown at the CHANGE 1 site. The `ArrayList` constructor that accepts a collection (`new ArrayList<>(Arrays.asList(parts))`) would also work, but the loop is kept here to accommodate CHANGE 2 in the same pass.

**Explanation:** `Arrays.asList` returns a `java.util.Arrays$ArrayList`, a private inner class that is backed directly by the original array. Because arrays have a fixed length, this wrapper deliberately throws `UnsupportedOperationException` on `add` and `remove` — it only supports `set`, which keeps the size constant. The return type is declared as `List<String>`, which looks like a normal resizable list in the call site, so there is no compile-time warning. Wrapping the result in `new ArrayList<>(...)` copies the elements into a fully mutable list. A related pitfall: `List.of(...)` and `List.copyOf(...)` introduced in Java 9 are also immutable and throw the same exception, so any factory method that produces an "unmodifiable" or "fixed-size" list has this same constraint.

---

### Issue 2: Blank Flag From Empty CSV Input

**Problem:** If the environment variable is empty or contains only whitespace, `"".split(",")` returns `[""]` — a one-element array holding an empty string. That empty string gets added to `enabled`, so `isEnabled("")` returns `true` and the flag list is never actually empty.

**Fix:** At the CHANGE 2 site, each token from `split` is trimmed and skipped if it is empty before being added to the `ArrayList`. This prevents blank entries from entering the list regardless of the input format.

**Explanation:** `String.split` does not remove empty tokens that result from leading, trailing, or consecutive delimiters unless you pass a negative limit. For a CSV config value read from an environment variable, it is common for the variable to be set to an empty string rather than unset entirely, and operators may also add stray spaces around flag names. Trimming each part before the emptiness check also normalises `" featureA "` to `"featureA"`, which avoids later mismatches in `isEnabled` where the caller passes an untrimmed name. If trimming the stored flag name is undesirable (e.g., flag names are case- or space-sensitive), the `trim()` calls on the stored value can be removed while keeping the blank-entry guard.
