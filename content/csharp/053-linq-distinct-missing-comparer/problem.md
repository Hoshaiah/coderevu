---
slug: linq-distinct-missing-comparer
track: csharp
orderIndex: 53
title: Distinct Without Custom Comparer
difficulty: easy
tags:
  - linq
  - correctness
  - equality
language: csharp
---

## Context

This helper lives in `TagService.cs` inside a content management API. Tags are stored as strings in a PostgreSQL column with case-insensitive collation (`citext`). When a client posts an article, the tag list is deduped server-side before being written to the database so that tags like `CSharp` and `csharp` are treated as the same value.

Users started reporting duplicate tags appearing on articles after a migration moved from hand-rolled dedup logic to LINQ. The symptom is consistent: two tags that differ only in casing both appear in the stored article's tag list. Metrics show roughly 3% of article saves produce at least one duplicate tag pair.

The team inspected the database and confirmed the duplicates are written correctly — the issue is upstream, in the dedup step before the insert. A quick test confirmed `new[] { "CSharp", "csharp" }.Distinct().Count()` returns `2` in their unit test, which they expected to return `1`.

## Buggy code

```csharp
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
            .Distinct()
            .OrderBy(t => t)
            .ToList();
    }

    public async Task SaveTagsAsync(int articleId, IEnumerable<string> rawTags)
    {
        var tags = Normalise(rawTags);
        await _repo.ReplaceTagsAsync(articleId, tags);
    }
}
```
