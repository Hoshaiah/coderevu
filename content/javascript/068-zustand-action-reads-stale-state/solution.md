## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — Zustand Set Reads Stale Snapshot
// ------------------------------------------------------------------------

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

  // CHANGE 1: Use a state-updater function instead of get()+set(object) so markAllRead always operates on the latest committed state, preventing stale-snapshot overwrites.
  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    })),
}));

export default useNotificationsStore;
```

## Explanation

### Issue 1: Stale Snapshot Overwrites Concurrent Updates

**Problem:** After clicking "Mark all as read", notifications that arrived just before or during the click remain unread. When messages come in rapidly, users see a mix of read and unread items even right after marking all.

**Fix:** Replace the `get().notifications` + `set({ notifications: updated })` pattern in `markAllRead` with a single `set((state) => ({ notifications: state.notifications.map(...) }))` call, matching how `addNotification` already works.

**Explanation:** Zustand's `get()` returns the state at the moment it is called. Between that call and the subsequent `set()`, another `addNotification` call can fire its own `set()` and append a new notification. When `markAllRead`'s `set()` then runs, it overwrites the entire `notifications` array with the snapshot it captured earlier, erasing the notification that `addNotification` just added — or, conversely, `addNotification`'s updater runs after `markAllRead` and fans out a fresh unread item from the pre-mark state. Using an updater function (`set((state) => ...)`) tells Zustand to apply the transform against whatever the committed state is at the moment the update is actually processed, so it composes safely with other concurrent updater functions rather than clobbering them. This is the same reason `addNotification` correctly uses an updater function — `markAllRead` must follow the same pattern for the same reason.

---
