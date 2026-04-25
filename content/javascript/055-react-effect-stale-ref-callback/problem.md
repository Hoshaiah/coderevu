---
slug: react-effect-stale-ref-callback
track: javascript
orderIndex: 55
title: Stale Ref in Resize Observer
difficulty: medium
tags:
  - hooks
  - closures
  - react
language: typescript
---

## Context

This component is defined in `src/components/AutoResizePanel.tsx`. It attaches a `ResizeObserver` to a container div and calls an `onResize` prop callback whenever the panel's dimensions change, passing the new width and height. The parent uses this to update layout state.

Users report that the `onResize` callback seems to always call the initial version of the callback — changes made to the callback (e.g., after parent state changes) are ignored until the page refreshes. This manifests as the layout never updating correctly after the first render, even when the panel is visibly resized.

The team verified that the `ResizeObserver` itself is firing correctly by logging the raw `entries` inside the effect. The observer sees the resize events; the problem is what happens after.

## Buggy code

```typescript
import React, { useEffect, useRef } from 'react';

interface Props {
  onResize: (width: number, height: number) => void;
  children: React.ReactNode;
}

export function AutoResizePanel({ onResize, children }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        onResize(width, height);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);  // empty deps — observer is created once

  return <div ref={containerRef}>{children}</div>;
}
```
