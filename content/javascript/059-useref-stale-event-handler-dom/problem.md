---
slug: useref-stale-event-handler-dom
track: javascript
orderIndex: 59
title: Stale Ref in DOM Event Listener
difficulty: medium
tags:
  - hooks
  - closures
  - react
language: typescript
---

## Context

The component `src/components/KeyboardShortcut.tsx` registers a `keydown` listener on `window` to trigger an in-app action when the user presses a configurable hotkey. The action callback and the enabled flag are passed as props and can change over time (e.g. when the user navigates between pages in a single-page app, the action changes).

Users report that after navigating to a different section of the app, the keyboard shortcut triggers the *previous* section's action instead of the current one. For example, pressing `Ctrl+S` on the settings page saves the previous form rather than the settings form. Reloading the page fixes it.

The team verified the `action` prop is definitely changing — React DevTools shows the new function reference being passed. They also confirmed the listener is not being duplicated (it is cleaned up correctly).

## Buggy code

```typescript
import { useEffect, useRef } from "react";

interface Props {
  hotkey: string; // e.g. "ctrl+s"
  action: () => void;
  enabled: boolean;
}

export function KeyboardShortcut({ hotkey, action, enabled }: Props) {
  const actionRef = useRef(action);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const pressed =
        (e.ctrlKey ? "ctrl+" : "") +
        (e.metaKey ? "meta+" : "") +
        e.key.toLowerCase();

      if (pressed === hotkey && enabled) {
        actionRef.current();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [hotkey]);

  return null;
}
```
