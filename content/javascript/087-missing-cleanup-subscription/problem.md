---
slug: missing-cleanup-subscription
track: javascript
orderIndex: 87
title: useEffect Missing Event Listener Cleanup
difficulty: easy
tags:
  - effects
  - cleanup
  - event-listeners
  - memory-leak
language: typescript
---

## Context

This `useWindowWidth` hook is used in a dashboard to make charts responsive. Developers noticed that resizing the window triggers the resize handler an increasing number of times after each navigation away from and back to the page.

## Buggy code

```typescript
import { useEffect, useState } from "react";

export function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
  }, []);

  return width;
}
```
