## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Rapid input changes cause stale fetch responses to overwrite the latest result
// ------------------------------------------------------------------------
import { useEffect, useState } from "react";

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }

    // CHANGE 1: Create an AbortController so we can cancel the in-flight request when the query changes before the response arrives.
    const controller = new AbortController();

    fetch(`/api/search?q=${encodeURIComponent(query)}`, {
      // CHANGE 1: Pass the abort signal to fetch so the browser cancels the request and the .then() callbacks are never called after cleanup.
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((data) => setResults(data.results))
      // CHANGE 2: Catch errors so network failures and non-abort rejections are handled explicitly instead of silently leaving stale results.
      .catch((err) => {
        if (err.name !== "AbortError") {
          // Non-abort errors (real network/server failures) clear results
          // so the user does not keep seeing data from a previous query.
          setResults([]);
        }
        // AbortErrors are expected when the effect cleans up; ignore them.
      });

    // CHANGE 1: Return a cleanup function that aborts the fetch when the effect re-runs (query changed) or the component unmounts.
    return () => {
      controller.abort();
    };
  }, [query]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {results.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Explanation

### Issue 1: Stale fetch responses overwrite current results

**Problem:** When a user types quickly, multiple fetch requests are in-flight at the same time. If an earlier request finishes after a later one, its `setResults` call runs last and replaces the correct results with stale data that does not match what is in the input box.

**Fix:** An `AbortController` is created inside the effect, its `signal` is passed to `fetch`, and the effect's cleanup function calls `controller.abort()`. This cancels the in-flight request whenever `query` changes or the component unmounts, preventing `setResults` from being called with outdated data.

**Explanation:** React's `useEffect` cleanup runs before the next invocation of the same effect. Without a cleanup, every keystroke fires a new fetch but the previous one keeps running unimpeded. Whichever response arrives last wins — and on a slow network that is often not the most recent request. Passing `controller.signal` to `fetch` tells the browser to abort the underlying HTTP request when `controller.abort()` is called; the promise rejects with an `AbortError`, so neither `.then()` callback executes and `setResults` is never called with the stale payload. A related pitfall: if you use a boolean `cancelled` flag instead of `AbortController` you avoid the `setResults` call, but the HTTP request still completes and wastes bandwidth — `AbortController` actually cancels the network activity.

---

### Issue 2: Fetch errors silently leave stale results visible

**Problem:** If a fetch fails due to a network error or a non-2xx response that causes `r.json()` to throw, the rejected promise has no `.catch()` handler. The previous results stay on screen unchanged, so the user sees results that no longer correspond to any real query state.

**Fix:** A `.catch()` block is added after the `.then()` chain. It checks `err.name !== "AbortError"` and calls `setResults([])` for genuine failures, clearing stale data. Abort errors — which happen intentionally during cleanup — are ignored.

**Explanation:** An unhandled promise rejection in a `useEffect` does not throw to React's error boundary; it either surfaces as a browser console warning or disappears entirely. The component state is left wherever the last successful `setResults` put it, which is visually misleading. Distinguishing `AbortError` from real errors is necessary because the `AbortController` cleanup in Issue 1 deliberately rejects the promise; treating that as a failure would clear results every time the user types a character, flickering the list to empty before the next response arrives.
