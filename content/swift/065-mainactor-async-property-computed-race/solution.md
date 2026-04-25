## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Non-Isolated Computed Property Read Race
// ------------------------------------------------------------------------

@MainActor
class DashboardViewModel: ObservableObject {
    @Published var articles: [Article] = []

    // CHANGE 1: Removed `nonisolated` so the computed property inherits @MainActor isolation from the class, ensuring reads of `articles` are serialized with writes.
    var topArticles: [Article] {
        return Array(articles.prefix(5))
    }

    func refresh() async {
        let fetched = await ArticleService.shared.fetchLatest()
        articles = fetched
    }
}
```

## Explanation

### Issue 1: `nonisolated` Removes Actor Isolation From Property

**Problem:** `topArticles` is marked `nonisolated`, which explicitly opts it out of the `@MainActor` isolation that the enclosing class declares. Any caller — including one running on a background thread — can invoke `topArticles` synchronously without hopping to the main actor first. Meanwhile, `refresh()` writes to `articles` from an `async` context that may briefly execute off the main thread before the assignment. TSan catches these overlapping accesses as a data race.

**Fix:** Remove the `nonisolated` keyword from `topArticles`. With that keyword gone, the property inherits the class-level `@MainActor` annotation, and the Swift runtime enforces that it is only called from the main actor, serializing all reads with the write in `refresh()`.

**Explanation:** Swift's actor isolation works by guaranteeing that all accesses to actor-isolated state happen in a mutually exclusive context. When you add `nonisolated` to a member of a `@MainActor` class, you are telling the compiler "this member does not need isolation", so the compiler stops enforcing the restriction and stops emitting the hop-to-main-actor call at each call site. The compiler accepted the code with no warnings because `nonisolated` is a valid annotation; it just has runtime consequences the author did not intend. The fix is to let the property be isolated like every other member of the class. A related pitfall: `nonisolated` is legitimately useful for things like `Hashable` conformance or `description` that truly never touch mutable state — but `topArticles` reads `articles`, which is mutable, so it must be isolated.

---

### Issue 2: Misleading Comment Rationalizing an Unsafe Annotation

**Problem:** The comment claims `nonisolated` was added to avoid a warning about "synchronous access in a purely read-only context". This framing is wrong and will mislead future maintainers into believing the annotation is safe or necessary, increasing the chance the bug is reintroduced or copied elsewhere.

**Fix:** Replace the comment with one that explains the correct reason `topArticles` must remain `@MainActor`-isolated: reads of mutable shared state still require isolation. The `// CHANGE 1` comment in the reference solution does this inline.

**Explanation:** A "read-only" operation on a `var` stored property is not inherently thread-safe. Reading and writing the same memory location from different threads simultaneously is a data race regardless of which side is the writer. The original comment created a false mental model where reads were considered harmless outside isolation. Correcting the comment is a maintenance fix: the next engineer who sees `nonisolated` without a clear explanation may assume the original author had a good reason and leave it in place, or copy the pattern to another property.
