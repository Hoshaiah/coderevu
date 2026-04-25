## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — CancellationToken Registration Never Disposed
// ------------------------------------------------------------------------

public class LongPollingListener
{
    private readonly IVendorSubscription _subscription;

    public LongPollingListener(IVendorSubscription subscription)
    {
        _subscription = subscription;
    }

    public Task<Message> WaitForMessageAsync(CancellationToken cancellationToken)
    {
        var tcs = new TaskCompletionSource<Message>(TaskCreationOptions.RunContinuationsAsynchronously);

        // CHANGE 2: Capture the subscription handle so the callback can be unregistered once the task completes, preventing a dangling reference from the SDK into this closure.
        IDisposable? subscriptionHandle = null;

        // CHANGE 1: Store the CancellationTokenRegistration so it can be disposed when the task completes, preventing the registration from staying rooted in the CancellationTokenSource's linked list indefinitely.
        CancellationTokenRegistration registration = default;

        // CHANGE 3: Extract a shared cleanup action that disposes both the subscription handle and the cancellation registration regardless of which completion path wins, eliminating the race between result and cancellation paths.
        void Cleanup()
        {
            subscriptionHandle?.Dispose();
            registration.Dispose();
        }

        subscriptionHandle = _subscription.OnMessageReceived(msg =>
        {
            if (tcs.TrySetResult(msg))
            {
                // CHANGE 2: Dispose the subscription handle and registration on the success path so neither the SDK callback list nor the CancellationTokenSource hold references after the task is done.
                Cleanup();
            }
        });

        // CHANGE 1: Assign the returned CancellationTokenRegistration to a local so it is disposed via Cleanup() once the task completes, releasing the token's internal linked-list node.
        registration = cancellationToken.Register(() =>
        {
            if (tcs.TrySetCanceled(cancellationToken))
            {
                // CHANGE 3: Dispose on the cancellation path too, so cleanup runs symmetrically whether the task is cancelled or completed with a result.
                Cleanup();
            }
        });

        return tcs.Task;
    }
}
```

## Explanation

### Issue 1: CancellationTokenRegistration Never Disposed

**Problem:** Every call to `WaitForMessageAsync` calls `cancellationToken.Register()` and discards the returned `CancellationTokenRegistration`. The `CancellationTokenSource` holds each registration in an internal linked list until the source itself is disposed. Under load with thousands of connections, these registrations accumulate and are never freed, which shows up as steadily rising memory and high GC pressure even after traffic drops.

**Fix:** The return value of `cancellationToken.Register()` is captured in a `CancellationTokenRegistration` local named `registration`. `registration.Dispose()` is called inside the shared `Cleanup()` helper, which runs on both the cancellation and the result completion paths.

**Explanation:** `CancellationToken.Register()` allocates a node and inserts it into a linked list owned by the underlying `CancellationTokenSource`. The node is removed either when the source is cancelled (firing all callbacks) or when `Dispose()` is called on the returned `CancellationTokenRegistration`. If neither happens, the node — and everything it closes over, including the `TaskCompletionSource` — stays live for as long as the source exists. In this service the source typically lives for the duration of a request or connection, which can be seconds to minutes. With thousands of concurrent connections that figure multiplies quickly. Disposing the registration as soon as the task completes releases the linked-list node immediately so the GC can collect the closure.

---

### Issue 2: Vendor Subscription Callback Never Unregistered

**Problem:** `_subscription.OnMessageReceived` registers a callback with the vendor SDK. Once the task completes (either because a message arrived or because it was cancelled), the callback stays registered. The SDK continues to hold a reference into the closure, keeping the `TaskCompletionSource` and captured locals alive and potentially firing the callback again on a future message even though no one is listening.

**Fix:** `_subscription.OnMessageReceived` is assumed to return an `IDisposable` subscription handle (a common pattern in SDK subscription APIs). The handle is stored in `subscriptionHandle` and `subscriptionHandle?.Dispose()` is called inside `Cleanup()` on both completion paths.

**Explanation:** Vendor SDKs commonly model subscriptions as objects you dispose to unsubscribe. Without disposing, the SDK's internal subscriber list holds a delegate that closes over `tcs` and `registration`. Even after the task is complete, the GC cannot collect those objects because the SDK still holds a live reference. Calling `Dispose()` on the handle removes the subscriber from the SDK's list, breaking the reference chain. If your specific `IVendorSubscription` uses a different unsubscription mechanism (an `Unsubscribe` method, an event `-=`, etc.), the same principle applies — you need an explicit unsubscription call in the cleanup path.

---

### Issue 3: No Coordinated Cleanup Across Both Completion Paths

**Problem:** The original code has no cleanup logic at all. Once a fix for issues 1 and 2 is introduced, it's easy to accidentally dispose only on one path (say, cancellation) and forget the other (result received). The `TrySet*` methods on `TaskCompletionSource` return `false` when the task is already complete, so only one path ever "wins", but cleanup must still run regardless of which one wins.

**Fix:** A local `Cleanup()` action is defined that disposes both `subscriptionHandle` and `registration`. Both the `OnMessageReceived` callback and the `cancellationToken.Register` callback call `Cleanup()` only when their respective `TrySet*` call returns `true`, ensuring cleanup runs exactly once on whichever path completes the task first.

**Explanation:** `TrySetResult` and `TrySetCanceled` are both thread-safe and idempotent — the first caller wins and subsequent calls return `false`. By gating `Cleanup()` on the `true` return value, exactly one path runs cleanup even if a message arrives at the same instant as a cancellation. Without this guard you could call `registration.Dispose()` twice, which is harmless for `CancellationTokenRegistration` but indicates unclear ownership. The more dangerous omission is forgetting cleanup on one path entirely: if a message arrives before cancellation, the cancellation callback never fires, so a cleanup-only-on-cancellation approach would still leak the subscription handle.
