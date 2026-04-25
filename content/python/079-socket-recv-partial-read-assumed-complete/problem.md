---
slug: socket-recv-partial-read-assumed-complete
track: python
orderIndex: 79
title: Socket Recv Assumes Full Read
difficulty: medium
tags:
  - correctness
  - networking
  - protocol
language: python
---

## Context

This server component lives in `server/protocol.py` and implements a simple length-prefixed binary protocol for an internal RPC system. Clients send a 4-byte big-endian length header followed by a UTF-8 JSON payload. The handler is called from a threaded connection dispatcher.

Under normal load the server works fine. When network latency increases (observed during cross-datacenter tests or under heavy TCP load), the server occasionally parses garbled messages — JSON decode errors appear in logs, and some RPCs receive responses meant for different requests. The issue is intermittent and disappears when running both sides on localhost.

## Buggy code

```python
import socket
import struct
import json
from typing import Any

def read_message(sock: socket.socket) -> dict[str, Any]:
    header = sock.recv(4)
    if len(header) < 4:
        raise ConnectionError("Connection closed while reading header")
    (msg_len,) = struct.unpack(">I", header)

    payload = sock.recv(msg_len)
    return json.loads(payload.decode("utf-8"))

def handle_connection(sock: socket.socket) -> None:
    while True:
        try:
            msg = read_message(sock)
            response = process(msg)
            _send_message(sock, response)
        except (ConnectionError, json.JSONDecodeError):
            break

def process(msg: dict) -> dict:
    return {"status": "ok"}

def _send_message(sock: socket.socket, data: dict) -> None:
    pass
```
