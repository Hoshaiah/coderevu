---
slug: event-listener-memory-leak
track: javascript
orderIndex: 48
title: Event Listener Leak on Unmount
difficulty: medium
tags:
  - hooks
  - state
  - react
language: typescript
---

## Context

This component is in `src/components/KeyboardShortcutHandler.tsx`. It registers a `keydown` listener on `document` when mounted and is supposed to clean up after itself when unmounted. The component is conditionally rendered based on whether a modal is open — it mounts when the modal opens and should unmount when it closes.

After users open and close the modal several times, keyboard shortcuts start firing multiple times per keypress. Each keystroke produces two, then four, then eight console entries. Memory usage also grows noticeably during long sessions. Refreshing the page resets the behaviour.

The team confirmed the component mounts and unmounts correctly by adding `console.log` in the render body. They checked React DevTools and the component is not staying mounted.

## Buggy code

```typescript
import React, { useEffect, useState } from "react";

interface Props {
  onSave: () => void;
  onClose: () => void;
}

export function KeyboardShortcutHandler({ onSave, onClose }: Props) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "s" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSave();
      }
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    // cleanup
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onSave, onClose]);

  return null;
}
```
