---
slug: zustand-action-reads-stale-state
track: javascript
orderIndex: 68
title: Zustand Set Reads Stale Snapshot
difficulty: hard
tags:
  - state
  - async
  - closures
language: typescript
---

## Context

This Zustand store lives in `src/stores/notificationsStore.ts` in a real-time dashboard. Notifications arrive over a WebSocket and are added to the store. A `markAllRead` action is supposed to mark every current notification as read. Multiple WebSocket messages can arrive within the same event-loop tick.

Support tickets report that after clicking "Mark all as read", some notifications remain unread. This happens more often when messages are arriving rapidly. The bug is not reproducible in a slow network environment, suggesting a race between incoming messages and the mark-all action.

The team already verified the WebSocket listener is correct and that `markAllRead` is being called. They added a log and confirmed `markAllRead` is called once per button click.

## Buggy code

```typescript
import { create } from 'zustand';

interface Notification {
  id: string;
  message: string;
  read: boolean;
}

interface NotificationsStore {
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'read'>) => void;
  markAllRead: () => void;
}

const useNotificationsStore = create<NotificationsStore>((set, get) => ({
  notifications: [],

  addNotification: (n) =>
    set((state) => ({
      notifications: [...state.notifications, { ...n, read: false }],
    })),

  markAllRead: () => {
    const current = get().notifications;
    const updated = current.map((n) => ({ ...n, read: true }));
    set({ notifications: updated });
  },
}));

export default useNotificationsStore;
```
