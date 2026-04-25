## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Registration Never Disposed
// ------------------------------------------------------------------------

public class ConnectionHandler
{
    private readonly Socket _socket;
    private readonly CancellationToken _shutdownToken;

    public ConnectionHandler(Socket socket, CancellationToken shutdownToken)
    {
        _socket = socket;
        _shutdownToken = shutdownToken;
    }

    public async Task RunAsync()
    {
        // CHANGE 1: Store the registration and dispose it in a finally block so the callback is unregistered from the CancellationTokenSource when the connection ends, preventing the memory leak.
        CancellationTokenRegistration registration = _shutdownToken.Register(() =>
        {
            _socket.Close();
        });

        var buffer = new byte[4096];
        try
        {
            while (true)
            {
                int read = await _socket.ReceiveAsync(buffer, SocketFlags.None);
                if (read == 0) break;
                await ProcessFrameAsync(buffer, read);
            }
        }
        catch (SocketException) { /* connection reset */ }
        finally
        {
            // CHANGE 1: Dispose the registration here so the CancellationTokenSource releases its reference to the callback closure, allowing the handler and socket to be collected.
            await registration.DisposeAsync();
            // CHANGE 2: Close the socket explicitly when the loop exits normally so the OS handle is released promptly rather than waiting for finalizers.
            _socket.Close();
        }
    }

    private Task ProcessFrameAsync(byte[] buffer, int length) =>
        Task.CompletedTask;
}
```

## Explanation

### Issue 1: Registration Callback Leaked via CancellationTokenSource

**Problem:** After each `ConnectionHandler` finishes, the `CancellationTokenSource` used for application shutdown still holds a reference to the lambda registered with `_shutdownToken.Register()`. That lambda captures `_socket`, keeping both the callback and the socket object alive. Over a multi-day run with thousands of connections, this produces a continuously growing list of registrations rooted in the application-lifetime token source.

**Fix:** Capture the return value of `_shutdownToken.Register()` into a `CancellationTokenRegistration` variable named `registration`, then call `await registration.DisposeAsync()` inside a `finally` block at the end of `RunAsync()`. This is the `CHANGE 1` site.

**Explanation:** `CancellationToken.Register()` appends a node to an internal linked list owned by the `CancellationTokenSource`. The node holds a delegate — here a closure over `_socket`. Nothing removes that node automatically when the handler finishes; removal only happens if the token is cancelled or the registration is disposed. Because the token source lives for the entire process lifetime, every connection that ever ran accumulates a node in that list. Calling `DisposeAsync()` (or `Dispose()`) on the returned `CancellationTokenRegistration` explicitly removes the node from the source's list, releasing the closure and the socket reference. Using `DisposeAsync()` is preferred here because it awaits any in-progress callback execution before returning, avoiding a race where the callback fires against a partially-torn-down socket.

---

### Issue 2: Socket Not Closed on Normal Connection Exit

**Problem:** When the remote peer closes the connection (`read == 0`) or a `SocketException` is caught, `RunAsync()` exits without closing `_socket`. The socket's OS handle stays open until the garbage collector eventually runs the finalizer, which on a busy server under memory pressure may be delayed significantly.

**Fix:** Add `_socket.Close()` inside the `finally` block after disposing the registration (`CHANGE 2`). This runs whether the loop exits by `break`, by `SocketException`, or by any other path.

**Explanation:** `Socket` wraps an OS-level file descriptor. Without an explicit `Close()` or `Dispose()`, the descriptor is only released when the finalizer thread runs, which is non-deterministic. Under sustained connection load, the process can exhaust the OS file-descriptor limit long before the GC catches up. Calling `_socket.Close()` in `finally` ensures the handle is returned to the OS immediately on every exit path. Note that the shutdown-token callback also calls `_socket.Close()`, but after `registration.DisposeAsync()` completes the callback can no longer fire, so the explicit `finally` close is the one that matters for the normal exit path. `Socket.Close()` is idempotent, so calling it twice is safe if a race with the token callback somehow occurred before disposal.
