## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Force Cast Silently Crashes Array
// ------------------------------------------------------------------------

final class ProductListViewController: UIViewController {
    // CHANGE 1: Store as [ProductDisplayable] so the type system enforces conformance instead of relying on a runtime force cast later.
    private var items: [ProductDisplayable] = []

    func configure(with rawItems: [Any]) {
        // CHANGE 1: Cast to ProductDisplayable here, at the boundary, and drop anything that does not conform — including FeaturedBanner and any future unknown types.
        items = rawItems.compactMap { $0 as? ProductDisplayable }
    }

    func tableView(_ tableView: UITableView,
                   cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        // CHANGE 2: Use `as?` with a guard so a misconfigured cell identifier produces a clear early-return instead of a force-cast crash.
        guard let cell = tableView.dequeueReusableCell(
            withIdentifier: "ProductCell", for: indexPath) as? ProductCell else {
            assertionFailure("Expected a ProductCell for identifier 'ProductCell'")
            return UITableViewCell()
        }

        let item = items[indexPath.row]
        // CHANGE 1: `item` is already ProductDisplayable — no cast needed here at all.
        cell.configure(with: item)
        return cell
    }
}
```

## Explanation

### Issue 1: Force Cast on Unfiltered Heterogeneous Items

**Problem:** When the backend includes a `FeaturedBanner` in the feed, `configure(with:)` keeps it in `items` because the filter only checks `is Product || is SponsoredProduct`. If `FeaturedBanner` conforms to neither but somehow slips through (or if `SponsoredProduct` was added to the filter without also adopting `ProductDisplayable`), then `item as! ProductDisplayable` in `cellForRowAt` traps with `EXC_BAD_INSTRUCTION`. Users see an immediate crash whenever that row is scrolled into view.

**Fix:** Replace the `filter` + `[Any]` storage with a `compactMap { $0 as? ProductDisplayable }` that casts every raw item to `ProductDisplayable` at the data-ingestion boundary, and change `items` to `[ProductDisplayable]`. Remove the force cast `item as! ProductDisplayable` from `cellForRowAt` entirely — `item` is already the right type.

**Explanation:** The root problem is that the filter and the cast are decoupled: the filter decides what to keep, but the cast assumes those kept items satisfy a different criterion (`ProductDisplayable` conformance). Adding `SponsoredProduct` to the filter without verifying it conforms to `ProductDisplayable` breaks that assumption silently. `compactMap { $0 as? ProductDisplayable }` collapses both steps into one: an item stays in the array only if it actually conforms, and the array's element type proves that to the compiler. Future item types — `FeaturedBanner`, `PromotedListing`, anything — are automatically excluded without any code change. The one pitfall to watch: if a legitimate `Product` subclass forgets to declare `ProductDisplayable` conformance, `compactMap` will silently drop it, so conformance should be verified in unit tests against real model types.

---

### Issue 2: Force Cast on Dequeued Cell

**Problem:** `dequeueReusableCell(withIdentifier:for:) as! ProductCell` crashes if the storyboard or `register(_:forCellReuseIdentifier:)` call maps `"ProductCell"` to the wrong class. During development this is invisible because the correct nib is always registered, but a refactor that renames the cell class or changes the identifier causes an unrecoverable trap in production.

**Fix:** Replace `as! ProductCell` with `as? ProductCell` inside a `guard` statement. On failure, call `assertionFailure` (which triggers only in debug builds) and return a plain `UITableViewCell()` so release builds degrade gracefully instead of crashing.

**Explanation:** `dequeueReusableCell(withIdentifier:for:)` returns `UITableViewCell`, and the runtime type depends entirely on what was registered for that identifier. A force cast succeeds as long as the registration matches, but it gives no diagnostic when it fails — the trap message does not name the identifier or the expected class. A `guard let` cast surfaces the mismatch at the exact call site with a readable `assertionFailure` message during development, and the fallback return prevents a crash in production. The `assertionFailure` is stripped from release builds by the compiler, so there is no performance cost in shipping code. Note that returning an empty `UITableViewCell()` in production means the row appears blank rather than causing a crash — acceptable degradation, but the underlying registration bug should still be caught in CI via the debug assertion.
