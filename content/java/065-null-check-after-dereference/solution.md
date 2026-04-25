## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Null Checked After Dereference
// ------------------------------------------------------------------------

import java.util.List;

public class InvoiceValidator {

    public String validate(Invoice invoice) {
        if (invoice == null) {
            return "Invoice must not be null";
        }

        List<LineItem> items = invoice.getLineItems();
        // CHANGE 1: Null check moved before size check, and operands reordered so `items == null` is tested first; calling `items.size()` when items is null causes NPE.
        if (items == null || items.size() == 0) {
            return "Invoice must have at least one line item";
        }

        if (invoice.getTotalAmount() <= 0) {
            return "Invoice total must be positive";
        }

        return null; // valid
    }

    interface Invoice {
        List<LineItem> getLineItems();
        double getTotalAmount();
    }

    interface LineItem {}
}
```

## Explanation

### Issue 1: Null Dereference Before Null Check

**Problem:** When `invoice.getLineItems()` returns `null`, the code calls `items.size()` on that null reference before it ever tests `items == null`. This throws a `NullPointerException`, which propagates up to the controller's 500-error handler instead of producing the intended 400 validation response.

**Fix:** Swap the two operands in the condition so it reads `items == null || items.size() == 0` (CHANGE 1). The null guard now appears on the left side of `||`.

**Explanation:** Java's `||` operator short-circuits left-to-right: if the left operand is `true`, the right operand is never evaluated. In the original code the left operand is `items.size() == 0`, which dereferences `items` unconditionally. Moving `items == null` to the left means that when `items` is null, the condition is immediately `true` and `items.size()` is never reached. A related pitfall is `&&` with the same mistake in reverse — placing a null check on the right of `&&` similarly provides no protection, because `&&` only skips the right side when the left is `false`, meaning a non-null check on the left still allows a null reference through on the right.

---

### Issue 2: Short-Circuit Logic Order Defeats Guard

**Problem:** Even if a developer recognizes that both checks are present, the order of operands in `||` means the null guard is structurally unreachable as a protector. The reviewer saw the null check and signed off, not noticing that the left operand always executes first and can already throw.

**Fix:** The same reordering in CHANGE 1 — writing `items == null || items.size() == 0` — corrects the logic order so that `||` short-circuits past `items.size()` whenever `items` is null.

**Explanation:** `||` guarantees the right operand is skipped when the left is `true`, but it provides zero protection to the left operand itself. Placing the cheaper, safer predicate (`items == null`) on the left and the potentially dangerous call (`items.size()`) on the right is the standard pattern for guarded evaluation. This also aligns with the `isEmpty()` alternative (`items == null || items.isEmpty()`), which many teams prefer because it reads as a single semantic concept — "the list is absent or empty" — and avoids the magic literal `0`.
