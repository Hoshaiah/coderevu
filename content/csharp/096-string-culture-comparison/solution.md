## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Locale-sensitive string comparison causes silent data mismatches in Turkish deployments
// ------------------------------------------------------------------------
public class WebhookRouter
{
    // CHANGE 2: Use StringComparer.OrdinalIgnoreCase so lookups are locale-independent and we no longer need to upper-case keys at all.
    private readonly Dictionary<string, Func<string, Task>> _handlers =
        new(StringComparer.OrdinalIgnoreCase);

    public void Register(string eventType, Func<string, Task> handler)
    {
        // CHANGE 1: Store the original eventType instead of calling ToUpper(); locale-sensitive casing (e.g. Turkish 'i' -> '\u0130') is avoided entirely.
        _handlers[eventType] = handler;
    }

    public async Task RouteAsync(string eventType, string payload)
    {
        // CHANGE 1: Use the raw eventType as the lookup key; OrdinalIgnoreCase on the dictionary handles case folding without locale influence.
        if (_handlers.TryGetValue(eventType, out var handler))
        {
            await handler(payload);
        }
        else
        {
            Console.WriteLine($"No handler registered for event: {eventType}");
        }
    }
}
```

## Explanation

### Issue 1: Locale-sensitive `ToUpper()` breaks Turkish 'i'

**Problem:** On a system whose locale is Turkish (`tr-TR`), `"invoice.created".ToUpper()` produces `"\u0130NVOICE.CREATED"` (with a dotted capital İ) instead of `"INVOICE.CREATED"`. The handler is registered with one uppercase string and looked up with a different one, so `TryGetValue` never finds a match and every `invoice.*` event is silently dropped.

**Fix:** Remove both calls to `ToUpper()` in `Register` and `RouteAsync` (CHANGE 1 sites). Store and look up `eventType` as-is; the dictionary's comparer (see CHANGE 2) handles case-insensitivity without touching the string.

**Explanation:** `string.ToUpper()` with no argument uses `CultureInfo.CurrentCulture`. In Turkish, the lowercase Latin `i` (U+0069) uppercases to dotted İ (U+0130), not the ASCII `I` (U+0049) that every other locale produces. So `Register` (running at startup in a neutral context) stores `"INVOICE.CREATED"` while `RouteAsync` (running in the Turkish locale thread) stores `"\u0130NVOICE.CREATED"` — or vice-versa — and the dictionary key never matches. The same trap affects any character that Turkish casing transforms differently, like uppercase `I` lowercasing to dotless `ı` (U+0131). Dropping `ToUpper()` entirely removes the locale dependency from key production.

---

### Issue 2: Dictionary comparer is mismatched with key-production strategy

**Problem:** Even after fixing the `ToUpper()` calls, using the default `Dictionary<string, …>` comparer (which is `StringComparer.Ordinal`) means the caller must pass an exactly-matching string. Any casing variation in incoming webhook payloads (e.g. `"Invoice.Created"` vs `"invoice.created"`) silently fails to route.

**Fix:** Construct the dictionary with `StringComparer.OrdinalIgnoreCase` (CHANGE 2). This single comparer makes both storage and lookup case-insensitive using byte-level comparison with no locale influence.

**Explanation:** `StringComparer.OrdinalIgnoreCase` folds case by comparing Unicode code points directly after ASCII-range case normalisation, with no reference to `CultureInfo.CurrentCulture`. It is consistent regardless of which locale the OS or thread is configured with. Centralising case-insensitivity in the comparer — rather than in `ToUpper()` calls scattered through the code — means there is one authoritative place that controls matching behaviour and no risk of the key-production and key-comparison steps diverging. A related pitfall: if you later serialize the handler keys to a config file and read them back, ordinal comparison ensures round-trip fidelity because no locale-specific casing transformation was applied.
