## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Fetch Not Aborted on Unmount
// ------------------------------------------------------------------------

interface SearchResult {
  id: string;
  title: string;
  url: string;
}

const SearchResults: React.FC<{ query: string }> = ({ query }) => {
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!query) return;

    // CHANGE 1: Create an AbortController so we can cancel the in-flight fetch when the component unmounts or the query changes before the response arrives.
    const controller = new AbortController();

    setLoading(true);
    // CHANGE 1: Pass the AbortSignal to fetch so the browser actually cancels the network request when abort() is called.
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: SearchResult[]) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        // CHANGE 1: Ignore AbortError — it is not a real failure, just the cleanup path firing; all other errors are still logged.
        if (err.name === 'AbortError') return;
        console.error("Search failed", err);
        setLoading(false);
      });

    // CHANGE 1 & 2: Return a cleanup function that aborts the fetch; React calls this both when query changes (preventing stale responses from landing) and when the component unmounts.
    return () => {
      controller.abort();
    };
  }, [query]);

  if (loading) return <div>Loading...</div>;
  return (
    <ul>
      {results.map((r) => (
        <li key={r.id}><a href={r.url}>{r.title}</a></li>
      ))}
    </ul>
  );
};
```

## Explanation

### Issue 1: Fetch not cancelled on unmount

**Problem:** When the modal closes while a search request is in flight, the `fetch` promise continues resolving in the background. Its `.then()` callbacks call `setResults` and `setLoading` after React has already torn down the component tree, producing the "Can't perform a React state update on an unmounted component" warning and, in edge cases, a null-dereference crash in Sentry.

**Fix:** An `AbortController` is created at the top of the effect. Its `signal` is passed as the second argument to `fetch`. The effect's cleanup function calls `controller.abort()`, which React invokes when the component unmounts. The `.catch()` handler is extended to silently swallow `AbortError` so the abort does not produce a spurious error log.

**Explanation:** `fetch` returns a promise that the JavaScript runtime holds a reference to regardless of what React does. React's `useEffect` cleanup is the designated hook for tearing down side effects — returning a function from the effect body tells React "run this when you're done with me". Without an `AbortController`, aborting is impossible after the request is dispatched, so the only way to prevent the state update is to ignore it with a mounted-flag approach, which still wastes bandwidth. `AbortController` goes further: it signals the browser to drop the connection entirely. When `abort()` is called, `fetch` rejects the promise with a `DOMException` whose `name` is `'AbortError'`; checking for that name lets us distinguish a deliberate cancellation from a real network failure.

---

### Issue 2: Stale responses overwrite newer results on rapid query change

**Problem:** The query prop can change quickly due to the debounced input. If request A (for an older query) takes longer than request B (for a newer query), A's response arrives last and overwrites B's already-correct results, showing the user data for the query they no longer care about.

**Fix:** The same `controller.abort()` call in the cleanup function handles this. Because React re-runs the effect each time `query` changes, it first calls the previous effect's cleanup — aborting the in-flight request for the old query — before starting the new fetch. No additional logic is needed beyond what was added for Issue 1.

**Explanation:** React's effect lifecycle guarantees that when a dependency changes, the cleanup from the *previous* render runs before the new effect body executes. So for every new value of `query`, the previous `AbortController` is aborted first. This means only one active fetch exists at any moment, and only the fetch for the most recent query can ever call `setResults`. Without the abort, multiple fetches could be in flight simultaneously, and whichever completes last wins — which is not necessarily the most recent one.
