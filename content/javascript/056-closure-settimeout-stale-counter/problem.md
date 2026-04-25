---
slug: closure-settimeout-stale-counter
track: javascript
orderIndex: 56
title: setTimeout Closure Captures Stale State
difficulty: medium
tags:
  - hooks
  - closures
  - state
language: typescript
---

## Context

This component lives in `src/components/AutoSave.tsx` and is supposed to display a countdown (5, 4, 3, 2, 1) before auto-saving a draft document. It is wired to a save button in a rich text editor, and the countdown starts each time the user stops typing for two seconds.

Users report that the counter on screen either never moves past '5' or sometimes jumps erratically. Looking at the rendered DOM in React DevTools, `count` appears to stay stuck at its initial value for several ticks.

The developer confirmed that the `setInterval` is registering and clearing correctly — adding a `console.log` inside the interval callback shows it firing every second. The issue is specifically that the displayed count doesn't decrement.

## Buggy code

```typescript
import { useState, useEffect } from 'react';

interface Props {
  onSave: () => void;
}

export function AutoSave({ onSave }: Props) {
  const [count, setCount] = useState(5);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;

    const id = setInterval(() => {
      if (count <= 1) {
        clearInterval(id);
        setActive(false);
        onSave();
      } else {
        setCount(count - 1);
      }
    }, 1000);

    return () => clearInterval(id);
  }, [active]);

  return (
    <div>
      {active ? (
        <span>Saving in {count}...</span>
      ) : (
        <button onClick={() => { setCount(5); setActive(true); }}>Start</button>
      )}
    </div>
  );
}
```
