## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Cancelled Token Blocks Cleanup Work
// ------------------------------------------------------------------------

public class BlobUploadSession : IAsyncDisposable
{
    private readonly IBlobClient _client;
    private readonly string _uploadId;
    private bool _completed;
    private readonly CancellationToken _ct;

    public BlobUploadSession(
        IBlobClient client,
        string uploadId,
        CancellationToken ct)
    {
        _client   = client;
        _uploadId = uploadId;
        _ct       = ct;
    }

    public async Task UploadPartsAsync(Stream source)
    {
        // ... upload logic omitted
        _completed = true;
    }

    public async ValueTask DisposeAsync()
    {
        if (!_completed)
        {
            // Caller cancelled — abort the multipart upload server-side
            // CHANGE 1: Use CancellationToken.None instead of _ct so the abort HTTP request is not cancelled along with the upload; _ct is already cancelled at this point and would cause the abort to fail immediately.
            // CHANGE 2: Catch OperationCanceledException separately so any unexpected cancellation during abort is surfaced rather than silently swallowed, giving the caller visibility into failed cleanup.
            try
            {
                await _client.AbortMultipartUploadAsync(_uploadId, CancellationToken.None);
            }
            catch (OperationCanceledException ex)
            {
                throw new InvalidOperationException(
                    "AbortMultipartUploadAsync was cancelled unexpectedly; the multipart upload may be orphaned.", ex);
            }
        }
    }
}
```

## Explanation

### Issue 1: Cancelled Token Kills Abort Request

**Problem:** When the caller cancels the upload, `_ct` is already in the cancelled state by the time `DisposeAsync` runs. Passing that token to `AbortMultipartUploadAsync` causes the underlying HTTP client to throw `OperationCanceledException` before the request even leaves the process. The server log shows requests arriving because some transports check the token after the send, but the request body is empty or the connection is torn down immediately — the abort has no effect, and orphaned uploads accumulate.

**Fix:** Replace `_ct` with `CancellationToken.None` in the `AbortMultipartUploadAsync` call at the `CHANGE 1` site. The abort operation must complete regardless of the caller's cancellation state.

**Explanation:** `CancellationToken` cancellation is cooperative: any code that receives an already-cancelled token and checks it (which `HttpClient` does at the start of `SendAsync`) will throw immediately. The abort call is cleanup work that must run *because* the token was cancelled, so it must not be governed by that same token. Using `CancellationToken.None` gives the abort call an independent lifetime. A related pitfall is using a linked token source — if you create a `CancellationTokenSource` linked to `_ct` and pass its token here, the same failure happens because the parent is already cancelled and the linked source inherits that state at construction time.

---

### Issue 2: OperationCanceledException Silently Suppressed During Cleanup

**Problem:** Even with `CancellationToken.None`, if something else cancels the abort (a timeout, a secondary token, a bug in the client library), the `OperationCanceledException` propagates out of `DisposeAsync` and is typically swallowed by the `await using` infrastructure or a finalizer path. The caller has no indication that the abort failed, the upload remains orphaned, and there is nothing in the logs to alert the team.

**Fix:** At the `CHANGE 2` site, wrap the `AbortMultipartUploadAsync` call in a `try/catch` that catches `OperationCanceledException` and re-throws it as an `InvalidOperationException` with a descriptive message naming the risk of an orphaned upload.

**Explanation:** `await using` in C# will propagate exceptions thrown from `DisposeAsync`, but in many hosting patterns (background services, `IHostedService` shutdown) the dispose exception is caught and logged at a framework level rather than surfaced to the application code that triggered cancellation. Wrapping the exception as `InvalidOperationException` makes the failure visible in application-level exception handlers that may filter out or misclassify `OperationCanceledException` as routine. It also forces any future caller who catches `OperationCanceledException` broadly to see this as a distinct, actionable failure rather than normal cancellation noise.
