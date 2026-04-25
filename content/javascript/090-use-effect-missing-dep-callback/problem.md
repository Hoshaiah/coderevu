---
slug: use-effect-missing-dep-callback
track: javascript
orderIndex: 90
title: useEffect Missing Callback Dependency
difficulty: hard
tags:
  - effects
  - closures
  - deps
  - callbacks
language: typescript
---

## Context

A `PollingWidget` polls an endpoint every 5 seconds and calls an `onData` callback prop with the result. Users reported that after swapping data sources (which changes the `onData` handler in the parent), the widget continues to call the old handler. The exhaustive-deps ESLint rule is disabled in this project.

## Buggy code

```typescript
import { useEffect } from "react";

interface Props {
  endpoint: string;
  onData: (data: unknown) => void;
}

export function PollingWidget({ endpoint, onData }: Props) {
  useEffect(() => {
    const id = setInterval(() => {
      fetch(endpoint)
        .then((r) => r.json())
        .then((data) => onData(data));
    }, 5000);
    return () => clearInterval(id);
  }, [endpoint]);

  return <div>Polling {endpoint}…</div>;
}
```
