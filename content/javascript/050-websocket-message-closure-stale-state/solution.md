## Reference solution

```typescript
// ------------------------------------------------------------------------
// ANSWER — WebSocket Handler Reads Stale State
// ------------------------------------------------------------------------

import { useEffect, useState } from 'react';

export function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<string[]>([]);

  // CHANGE 2: added `roomId` to the dependency array so the socket reconnects when the room changes.
  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/room/${roomId}`);

    socket.addEventListener('message', (event) => {
      // CHANGE 1: use the functional updater form of `setMessages` so the callback always receives the current state instead of the stale closure value.
      setMessages((prev) => [...prev, event.data]);
    });

    return () => socket.close();
  }, [roomId]);

  return (
    <ul>
      {messages.map((msg, i) => <li key={i}>{msg}</li>)}
    </ul>
  );
}
```

## Explanation

### Issue 1: Stale Closure Overwrites Message List

**Problem:** Every time a new WebSocket message arrives, the entire message list resets to a single item — the new message. `console.log` inside the handler always shows a `messages` array of length 1, even after many messages have been received.

**Fix:** Replace `setMessages([...messages, event.data])` with the functional updater form `setMessages((prev) => [...prev, event.data])`. The `prev` parameter is provided by React and always reflects the current state at the time the updater runs.

**Explanation:** The `useEffect` callback runs once (empty dependency array) and creates a closure over `messages`. At that moment `messages` is `[]`. React state is immutable per render — the `messages` variable inside the closure is forever bound to that initial empty array. So every call to `setMessages([...messages, event.data])` spreads an empty array and produces `[event.data]`, discarding all prior messages. The functional updater form sidesteps closures entirely: React calls your updater with the real current state value, no matter when the closure was created. A related pitfall is batching — if two messages arrive in the same event loop tick, the functional form still chains correctly because each updater receives the output of the previous one.

---

### Issue 2: `roomId` Missing from Effect Dependency Array

**Problem:** If `roomId` changes (the user navigates to a different chat room), the component keeps the old WebSocket connection open and continues receiving messages from the previous room. The UI displays the correct `roomId` in the URL or heading but shows messages from the wrong room.

**Fix:** Add `roomId` to the `useEffect` dependency array, changing `[]` to `[roomId]`. This causes React to close the old socket (via the cleanup `socket.close()`) and open a new one pointed at the updated room URL whenever `roomId` changes.

**Explanation:** React's rule for `useEffect` is that any value used inside the effect that comes from the component's scope should be listed as a dependency. `roomId` is used to construct the WebSocket URL, so omitting it means the effect never re-runs on room changes. The cleanup function returned from the effect runs before the effect fires again, so adding `roomId` to the array ensures the old socket is properly closed before the new one is created — no leaked connections. If you intentionally want one connection for the lifetime of the component, you would need a different strategy (like a ref-based singleton), but for a room-specific socket, re-running on `roomId` change is the correct behavior.
