---
slug: ref-mutation-during-render
track: javascript
orderIndex: 60
title: Ref Mutated During Render Phase
difficulty: hard
tags:
  - hooks
  - react
  - state
  - correctness
language: typescript
---

## Context

This component lives in `src/components/AnimatedCounter.tsx`. It renders a number that smoothly animates to a new target value using `requestAnimationFrame`. The `useRef` is used to store the animation frame ID for cancellation, and the component also tracks a `renderCount` ref for internal telemetry logging.

In React 18's Strict Mode, the component logs `renderCount` values that jump by 2 instead of 1, and occasional animation glitches appear where the counter skips values or re-animates from zero. The issue disappears when Strict Mode is turned off, but the team wants to keep Strict Mode enabled and ship a correct implementation.

The team suspects the double-invoke behaviour of Strict Mode is exposing something, but profiling hasn't pinpointed the exact mutation causing the skipped animation frames.

## Buggy code

```typescript
import React, { useRef, useEffect, useState } from "react";

interface Props {
  target: number;
}

export function AnimatedCounter({ target }: Props) {
  const [display, setDisplay] = useState(0);
  const rafId = useRef<number | null>(null);
  const startValue = useRef(0);

  // Mutate ref during render to track how often this component renders
  const renderCount = useRef(0);
  renderCount.current += 1;
  console.log("Render count:", renderCount.current);

  useEffect(() => {
    startValue.current = display;
    const start = performance.now();
    const duration = 500;

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const current = Math.round(startValue.current + (target - startValue.current) * progress);
      setDisplay(current);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    }

    rafId.current = requestAnimationFrame(tick);

    return () => {
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
    };
  }, [target]);

  return <div className="counter">{display}</div>;
}
```
