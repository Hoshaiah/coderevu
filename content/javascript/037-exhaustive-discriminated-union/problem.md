---
slug: exhaustive-discriminated-union
track: javascript
orderIndex: 37
title: Non-Exhaustive Discriminated Union Switch
difficulty: medium
tags:
  - types
  - typescript
  - correctness
language: typescript
---

## Context

This code lives in `src/notifications/render.ts`, a module that converts a typed `Notification` union into a human-readable string for display in the UI notification centre. Every time a new notification type is added to the backend API, the backend team updates the `Notification` union type in the shared types package.

After a recent backend deploy that added a `"mention"` notification type, users started seeing `undefined` rendered in the notification centre for mention events instead of a meaningful message. The TypeScript compiler never flagged this as an error.

The team is confident the type definition was correctly updated — the union type includes `"mention"`. They are confused about why TypeScript didn't warn them.

## Buggy code

```typescript
type Notification =
  | { type: "like"; postId: string; fromUser: string }
  | { type: "comment"; postId: string; fromUser: string; preview: string }
  | { type: "follow"; fromUser: string }
  | { type: "mention"; postId: string; fromUser: string; context: string };

function renderNotification(n: Notification): string {
  switch (n.type) {
    case "like":
      return `${n.fromUser} liked your post.`;
    case "comment":
      return `${n.fromUser} commented: "${n.preview}"` ;
    case "follow":
      return `${n.fromUser} started following you.`;
    // "mention" case was never added after the union was updated
  }
}
```
