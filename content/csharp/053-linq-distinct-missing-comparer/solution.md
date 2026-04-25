## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Distinct Without Custom Comparer
// ------------------------------------------------------------------------

public class TagService
{
    private readonly ITagRepository _repo;

    public TagService(ITagRepository repo) => _repo = repo;

    /// <summary>
    /// Normalises and deduplicates a raw tag list before persistence.
    /// Tags are treated case-insensitively to match the database collation.
    /// </summary>
    public IReadOnlyList<string> Normalise(IEnumerable<string> rawTags)
    {
        return rawTags
            .Where(t => !string.IsNullOrWhiteSpace(t))
            .Select(t => t.Trim())
            // CHANGE 1: Pass StringComparer.OrdinalIgnoreCase so that tags differing only in case (e.g. "CSharp" vs "csharp") are treated as equal, matching the citext database collation.
            .Distinct(StringComparer.OrdinalIgnoreCase)
            // CHANGE 2: Pass StringComparer.OrdinalIgnoreCase to OrderBy for stable, culture-independent sort order consistent with the dedup comparer used above.
            .OrderBy(t => t, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task SaveTagsAsync(int articleId, IEnumerable<string> rawTags)
    {
        var tags = Normalise(rawTags);
        await _repo.ReplaceTagsAsync(articleId, tags);
    }
}
```

## Explanation

### Issue 1: Distinct Ignores Case Differences

**Problem:** Tags that differ only in casing — like `CSharp` and `csharp` — both survive the dedup step and get written to the database as two separate entries. Users see duplicate tags on articles, and the database (which uses `citext` and treats these as equal) ends up storing both values.

**Fix:** Replace `.Distinct()` with `.Distinct(StringComparer.OrdinalIgnoreCase)` at the CHANGE 1 site, supplying an `IEqualityComparer<string>` that equates strings regardless of case.

**Explanation:** `Distinct()` with no arguments uses `EqualityComparer<string>.Default`, which in .NET delegates to `string.Equals(a, b)` — an ordinal, case-sensitive comparison. So `"CSharp"` and `"csharp"` have different hash codes and are never considered equal. `StringComparer.OrdinalIgnoreCase` computes case-folded hash codes and performs case-insensitive equality checks, so both strings map to the same bucket and the second one is dropped. This matches what PostgreSQL's `citext` column does at the storage layer, keeping the two layers in sync. A related pitfall: `StringComparer.CurrentCultureIgnoreCase` would also fold case but its behaviour changes with the thread's culture setting, which can cause subtle bugs on servers with non-English locales.

---

### Issue 2: OrderBy Uses Culture-Sensitive Default Sort

**Problem:** `.OrderBy(t => t)` sorts strings using `StringComparer.CurrentCulture`, whose ordering can vary depending on the OS locale or thread culture. On servers with different locale settings, the same tag list can come out in a different order, making output non-deterministic and harder to test.

**Fix:** Replace `.OrderBy(t => t)` with `.OrderBy(t => t, StringComparer.OrdinalIgnoreCase)` at the CHANGE 2 site, supplying the same comparer used for deduplication.

**Explanation:** `Enumerable.OrderBy<T, TKey>` without a comparer calls `Comparer<string>.Default`, which resolves to a culture-sensitive, case-sensitive comparison. Using `StringComparer.OrdinalIgnoreCase` gives byte-level, locale-independent ordering that is consistent regardless of where the service runs. It also keeps the sort semantics aligned with the dedup step: if two tags were considered equal during `Distinct`, the surviving tag sorts by its stored casing rather than by culture-specific rules. A concrete pitfall of the default comparer is that in some Turkish locales, the uppercase of `i` is `İ` (dotted), so `"image"` and `"IMAGE"` sort differently than on English systems.
