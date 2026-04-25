## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Socket Recv Assumes Full Read
# ------------------------------------------------------------------------

import socket
import struct
import json
from typing import Any

# CHANGE 1+2: Replace bare sock.recv calls with a helper that loops until exactly n bytes are read.
def _recv_exactly(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("Connection closed before all bytes were received")
        buf.extend(chunk)
    return bytes(buf)

def read_message(sock: socket.socket) -> dict[str, Any]:
    # CHANGE 1: Use _recv_exactly instead of sock.recv(4) so a short read on the header is handled correctly.
    header = _recv_exactly(sock, 4)
    (msg_len,) = struct.unpack(">I", header)

    # CHANGE 2: Use _recv_exactly instead of sock.recv(msg_len) so a short read on the payload is handled correctly.
    payload = _recv_exactly(sock, msg_len)
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

## Explanation

### Issue 1: Header Read May Be Truncated

**Problem:** `sock.recv(4)` is not guaranteed to return all 4 bytes. TCP is a stream protocol; a single `recv` call returns however many bytes are available in the kernel buffer at that moment, which can be 1, 2, 3, or 4. When only 1–3 bytes arrive, the existing `len(header) < 4` check raises `ConnectionError` even though the connection is fine — the rest of the header bytes just haven't arrived yet. If the check is somehow bypassed or the read happens to return the wrong number of bytes silently, `struct.unpack` either raises or interprets a wrong length, corrupting every subsequent message.

**Fix:** Replace `sock.recv(4)` in `read_message` with a call to the new `_recv_exactly(sock, 4)`, which loops internally until exactly 4 bytes have been accumulated, raising `ConnectionError` only when the peer genuinely closes the connection.

**Explanation:** TCP delivers a byte stream, not message-sized chunks. The kernel hands data to `recv` based on what has arrived so far, not on what the sender wrote in one `send` call. Under high latency or heavy load, header bytes often arrive in multiple TCP segments. `_recv_exactly` keeps calling `recv(n - len(buf))` in a loop, requesting only the remaining bytes each time, so it always collects the full 4-byte header before returning. An important pitfall: `recv` returning an empty `bytes` object means the peer closed the connection — that is the only condition that should raise `ConnectionError`, and `_recv_exactly` handles it correctly.

---

### Issue 2: Payload Read May Be Truncated

**Problem:** `sock.recv(msg_len)` has the same partial-read problem for the payload. For any message larger than the current TCP receive window fill, `recv` returns a fragment. `json.loads` then tries to decode incomplete UTF-8 JSON, which produces `json.JSONDecodeError` in the logs. Worse, the remaining payload bytes sit in the socket buffer and are read as the *next* message's header, silently corrupting subsequent RPCs — this is exactly the cross-datacenter symptom described.

**Fix:** Replace `sock.recv(msg_len)` in `read_message` with `_recv_exactly(sock, msg_len)`, which loops until all `msg_len` payload bytes have been received before passing them to `json.loads`.

**Explanation:** When a payload is split across two or more TCP segments, the first `recv` call returns only the first segment's worth of data. The JSON decoder sees a truncated document and raises, but the unconsumed bytes remain in the socket. The next iteration of `handle_connection` reads those leftover bytes as a new 4-byte header, producing a nonsensical length, and the entire framing is now desynchronized. This explains why garbled responses get routed to wrong requests. `_recv_exactly` prevents desynchronization by never returning until all expected bytes are in hand, keeping the stream correctly framed.
