## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Blocking .Result Call Causes Deadlock
// ------------------------------------------------------------------------

public class TenantResolutionMiddleware : IHttpModule
{
    private readonly ITenantCacheService _cache;

    public TenantResolutionMiddleware(ITenantCacheService cache)
    {
        _cache = cache;
    }

    public void Init(HttpApplication context)
    {
        // CHANGE 3: Register an async event handler via AddOnBeginRequestAsync so ASP.NET tracks the async work and holds the pipeline until the Task completes.
        context.AddOnBeginRequestAsync(BeginBeginRequest, EndBeginRequest);
    }

    private IAsyncResult BeginBeginRequest(object sender, EventArgs e, AsyncCallback cb, object extraData)
    {
        var app = (HttpApplication)sender;
        var host = app.Request.Url.Host;

        // CHANGE 1: Replace .Result with an awaited async Task so the SynchronizationContext is never blocked, eliminating the deadlock.
        // CHANGE 2: Add ConfigureAwait(false) so the continuation does not attempt to re-enter the ASP.NET SynchronizationContext after the await.
        var task = ResolveAndAttachAsync(app, host);

        return TaskAsyncHelper.BeginTask(task, cb, extraData);
    }

    private void EndBeginRequest(IAsyncResult result)
    {
        TaskAsyncHelper.EndTask(result);
    }

    private async Task ResolveAndAttachAsync(HttpApplication app, string host)
    {
        // CHANGE 2: ConfigureAwait(false) prevents the continuation from trying to resume on the blocked request SynchronizationContext.
        var tenant = await _cache.ResolveAsync(host).ConfigureAwait(false);

        app.Context.Items["Tenant"] = tenant;
    }

    public void Dispose() { }

    // Minimal helper to bridge Task to IAsyncResult for classic ASP.NET.
    private static class TaskAsyncHelper
    {
        public static IAsyncResult BeginTask(Task task, AsyncCallback callback, object state)
        {
            var tcs = new TaskCompletionSource<object>(state);
            task.ContinueWith(t =>
            {
                if (t.IsFaulted)
                    tcs.TrySetException(t.Exception.InnerExceptions);
                else if (t.IsCanceled)
                    tcs.TrySetCanceled();
                else
                    tcs.TrySetResult(null);

                callback?.Invoke(tcs.Task);
            }, TaskScheduler.Default);
            return tcs.Task;
        }

        public static void EndTask(IAsyncResult result)
        {
            ((Task)result).GetAwaiter().GetResult();
        }
    }
}
```

## Explanation

### Issue 1: Blocking `.Result` Deadlocks on SynchronizationContext

**Problem:** Any request that hits this middleware hangs indefinitely and eventually times out. The hang is not tenant-specific — every request is affected. No exception or log message appears because the thread is stuck waiting, not crashing.

**Fix:** Remove `.Result` entirely and replace the synchronous `OnBeginRequest` handler with an `async Task` method (`ResolveAndAttachAsync`) called from a proper async event handler registered via `AddOnBeginRequestAsync`.

**Explanation:** ASP.NET Framework (System.Web) installs a custom `SynchronizationContext` per request. When you call `.Result` on a `Task`, the calling thread blocks while holding that context. The `async` method inside `_cache.ResolveAsync` needs to post its continuation back onto that same `SynchronizationContext` to resume — but the context is blocked waiting for the task to finish. Neither side can proceed, so the request hangs forever. Awaiting instead of blocking frees the thread immediately, allowing the continuation to run. The only safe way to block on async in this environment is to run the task outside the SynchronizationContext (e.g., via `Task.Run`), but the correct design is to not block at all.

---

### Issue 2: Missing `ConfigureAwait(false)` Prolongs Context Capture

**Problem:** Even after switching from `.Result` to `await`, if `ConfigureAwait(false)` is absent, the continuation after the `await` tries to re-enter the ASP.NET `SynchronizationContext`. Under load this adds unnecessary synchronization overhead and, in edge cases where the context is busy, can introduce subtle delays.

**Fix:** Add `.ConfigureAwait(false)` to the `await _cache.ResolveAsync(host)` call in `ResolveAndAttachAsync`. This tells the runtime not to marshal the continuation back onto the captured context.

**Explanation:** By default, every `await` captures the current `SynchronizationContext` and resumes on it after the awaited work completes. In a middleware that only needs to write to `app.Context.Items`, there is no reason to resume on the request context — `HttpContext` is accessible directly via the `app` reference without context affinity. Using `ConfigureAwait(false)` lets the continuation run on a thread-pool thread, which is faster and avoids any risk of contention on the request context. Forgetting this is a frequent source of subtle performance regressions in library and infrastructure code.

---

### Issue 3: Synchronous Event Handler Cannot Track Async Work

**Problem:** `OnBeginRequest` is a plain synchronous event handler. Even if the deadlock were somehow avoided (e.g., the await completed synchronously from cache), ASP.NET has no knowledge of the in-flight `Task`, so the pipeline can move to the next stage before `app.Context.Items["Tenant"]` is set. The tenant would be missing for all downstream handlers.

**Fix:** Replace the `OnBeginRequest` subscription with `context.AddOnBeginRequestAsync(BeginBeginRequest, EndBeginRequest)` inside `Init`, using the `IAsyncResult` APM pattern that classic ASP.NET's async pipeline understands.

**Explanation:** Classic ASP.NET (System.Web) does not natively understand `Task`-returning event handlers the way ASP.NET Core does. The only built-in way to tell the pipeline "wait for my async work before continuing" is the APM-style `AddOnBeginRequestAsync` / `AddOnEndRequestAsync` pair. The `BeginXxx` method returns an `IAsyncResult`; ASP.NET calls `EndXxx` only after the result completes, holding the pipeline in the meantime. The `TaskAsyncHelper` in the solution bridges `Task` to that APM contract with a `TaskCompletionSource`. Without this, the pipeline races past the middleware even when the await itself is correct.
