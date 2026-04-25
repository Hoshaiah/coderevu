---
slug: stale-interval
track: javascript
orderIndex: 45
title: Stale Closure In setInterval Hook
difficulty: easy
tags:
  - hooks
  - closures
  - effects
language: typescript
---

## Context

This `useTicker` hook is supposed to increment a counter once per second and log the current value. In the browser the log always prints `1`, even though the UI increments correctly.

## Buggy code

```tsx
import { useEffect, useState } from "react";

export function useTicker() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCount(count + 1);
      console.log("[ticker]", count);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return count;
}
```
