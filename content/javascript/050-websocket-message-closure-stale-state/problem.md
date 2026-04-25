---
slug: websocket-message-closure-stale-state
track: javascript
orderIndex: 50
title: WebSocket Handler Reads Stale State
difficulty: medium
tags:
  - hooks
  - closures
  - async
  - react
language: typescript
---

## Context

This React component lives in `src/features/chat/ChatRoom.tsx`. It opens a WebSocket connection on mount and appends incoming messages to a `messages` state array. The connection is opened once and the `message` event handler is registered inside a `useEffect` with an empty dependency array so the socket is not recreated on every render.

Users notice that after a few messages arrive, the message list in the UI only ever shows the most recent message — all previous messages disappear with each new one. Meanwhile, `console.log` inside the handler shows a `messages` array of length 1 on every call.

The team confirmed the WebSocket server is sending all messages correctly. They also verified that the component is not being unmounted and remounted.

## Buggy code

```typescript
import { useEffect, useState } from 'react';

export function ChatRoom({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const socket = new WebSocket(`wss://chat.example.com/room/${roomId}`);

    socket.addEventListener('message', (event) => {
      setMessages([...messages, event.data]);
    });

    return () => socket.close();
  }, []);

  return (
    <ul>
      {messages.map((msg, i) => <li key={i}>{msg}</li>)}
    </ul>
  );
}
```
