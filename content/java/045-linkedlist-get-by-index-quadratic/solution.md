## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — O(n²) LinkedList Index Access
// ------------------------------------------------------------------------

import java.util.List;

public class ReportRenderer {

    // CHANGE 2: Accept List<ReportRow> instead of LinkedList<ReportRow> so callers are not forced into a specific implementation and so the fix below is not circumvented by a future caller re-introducing LinkedList.
    public String render(List<ReportRow> rows) {
        StringBuilder sb = new StringBuilder();
        sb.append("<table>");
        // CHANGE 1: Replace index-based for loop with an iterator-based for-each loop so each row is visited via a single pointer advance (O(1)) rather than a full traversal from the head (O(n)), reducing total render time from O(n²) to O(n).
        int i = 0;
        for (ReportRow row : rows) {
            String rowClass = (i % 2 == 0) ? "even" : "odd";
            sb.append("<tr class=\"").append(rowClass).append("\">")
              .append(row.toHtml())
              .append("</tr>");
            i++;
        }
        sb.append("</table>");
        return sb.toString();
    }
}
```

## Explanation

### Issue 1: O(n²) LinkedList Index Access

**Problem:** The render method calls `rows.get(i)` inside a loop that runs n times. On a `LinkedList`, every `get(i)` call walks the internal doubly-linked chain from the head (or tail) node until it reaches position `i`. For row 5,000 in a 10,000-row list that is 5,000 node hops, performed 10,000 times, yielding roughly 50,000,000 total node traversals. This is why a 10,000-row report takes 30+ seconds and a 100,000-row report effectively never finishes.

**Fix:** Replace the `for (int i = 0; i < rows.size(); i++)` loop with a for-each loop (`for (ReportRow row : rows)`) and maintain a separate `int i` counter for the even/odd class. The for-each loop uses `LinkedList`'s `ListIterator`, which keeps a live pointer and advances it by one node per step.

**Explanation:** `LinkedList` does not store elements in a contiguous array, so there is no arithmetic shortcut to reach position `i`. The JDK implementation of `LinkedList.get(int)` starts from whichever end is closer and follows `next` or `prev` references until it arrives at the requested index — O(n) per call. Calling this in a loop gives O(n) × O(n) = O(n²) total work. A `ListIterator` (used internally by for-each) holds a reference to the current node and calls `next()` once per iteration, which is a single pointer dereference — O(1) per step, O(n) total. A related pitfall: if you ever need random access by index on large lists, use `ArrayList`, which backs storage with an array and returns any element in O(1).

---

### Issue 2: Parameter Type Exposes Implementation Detail

**Problem:** The method signature declares `LinkedList<ReportRow> rows` instead of `List<ReportRow> rows`. Any caller holding an `ArrayList` or other `List` must cast or copy before calling `render`, which is unnecessary friction. More importantly, this signature does not signal that index-based access is intended — it just accidentally permits the O(n²) pattern.

**Fix:** Change the parameter type from `LinkedList<ReportRow>` to `List<ReportRow>`. The import of `java.util.LinkedList` is also removed since it is no longer referenced.

**Explanation:** Programming to the `List` interface rather than a concrete class lets callers pass any list implementation — `ArrayList`, `LinkedList`, `Collections.unmodifiableList(...)`, etc. — without changes to the call site. It also makes the JDBC layer free to switch from `LinkedList` to `ArrayList` (which would fix Issue 1 even without the for-each change, because `ArrayList.get(i)` is O(1)). Keeping the concrete type in the signature creates unnecessary coupling between the renderer and the data-assembly layer and hides the performance risk from anyone reading the signature.
