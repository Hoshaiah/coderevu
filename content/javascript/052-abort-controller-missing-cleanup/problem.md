---
slug: abort-controller-missing-cleanup
track: javascript
orderIndex: 52
title: Fetch Not Aborted on Unmount
difficulty: medium
tags:
  - hooks
  - async
  - react
language: typescript
---

## Context

This component is `src/components/SearchResults.tsx`. It fires a fetch request whenever the search query prop changes and displays a list of results. The component is used inside a modal dialog that can be closed while a search is in flight.

Users on slow connections intermittently see the following error in the console: "Warning: Can't perform a React state update on an unmounted component." More critically, Sentry shows occasional `TypeError: Cannot read properties of null` originating from the `setResults` call after the component has been torn down. The query prop can change rapidly due to a debounced input.

The developer added a `return` inside the effect and confirmed the fetch fires correctly. They did not realize the fetch itself continues running in the background after the component unmounts.

## Buggy code

```typescript
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

    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then((data: SearchResult[]) => {
        setResults(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Search failed", err);
        setLoading(false);
      });
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
