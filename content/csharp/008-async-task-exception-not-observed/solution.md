## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Fire-and-Forget Task Exception Crashes Process
// ------------------------------------------------------------------------

public class AuditLogger
{
    private readonly IServiceProvider _sp;
    private readonly ILogger<AuditLogger> _logger;

    public AuditLogger(IServiceProvider sp, ILogger<AuditLogger> logger)
    {
        _sp = sp;
        _logger = logger;
    }

    // Non-blocking: caller does not await this.
    public void Log(AuditEvent evt)
    {
        // CHANGE 1: Attach ContinueWith to observe the task so that any fault is handled rather than left unobserved, which previously caused UnobservedTaskException to crash the process.
        _ = WriteAsync(evt).ContinueWith(
            t => _logger.LogError(t.Exception, "Fire-and-forget WriteAsync faulted."),
            TaskContinuationOptions.OnlyOnFaulted);
    }

    private async Task WriteAsync(AuditEvent evt)
    {
        // CHANGE 2: Wrap the entire body in try/catch so SqlException and other transient errors are caught and logged rather than faulting the task and surfacing as an unobserved exception.
        try
        {
            using var scope = _sp.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AuditDbContext>();
            // CHANGE 3: Add ConfigureAwait(false) because this work runs in a background fire-and-forget context and does not need to resume on the original synchronization context.
            await db.InsertAsync(evt).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "AuditLogger.WriteAsync failed for event {EventType}.", evt.GetType().Name);
        }
    }
}
```

## Explanation

### Issue 1: Unobserved faulted Task crashes process

**Problem:** `Log` calls `WriteAsync(evt)` and discards the returned `Task` without ever awaiting it or attaching a continuation. When `InsertAsync` throws (e.g., `SqlException`), the exception is stored in the `Task`. Once the GC finalizes that abandoned `Task`, the .NET runtime raises `TaskScheduler.UnobservedTaskException`, which by default terminates the process. Operators see an hourly crash with no obvious call site in the stack.

**Fix:** The `Log` method now calls `.ContinueWith(t => _logger.LogError(...), TaskContinuationOptions.OnlyOnFaulted)` on the returned `Task` and assigns the result to `_` to discard the continuation task explicitly. This observes the original task's exception before the GC can trigger `UnobservedTaskException`.

**Explanation:** A `Task`-returning method is not inherently safe to discard — it only avoids the `async void` pitfall of immediately re-throwing on the caller's synchronization context. The exception still lives inside the `Task` object. The .NET finalizer thread checks whether a faulted `Task`'s exception was ever observed (read via `.Exception`, `await`, or a continuation). If not, `UnobservedTaskException` fires. Attaching `ContinueWith` with `OnlyOnFaulted` reads the exception property in the continuation, marking it observed before finalization. A related pitfall: if you discard the continuation task itself (the one returned by `ContinueWith`), that continuation cannot fault because the callback only logs, so discarding it with `_` is safe here.

---

### Issue 2: No exception handling lets transient errors fault the Task

**Problem:** `WriteAsync` has no `try/catch`, so a `SqlException` (secondary database unreachable) immediately faults the `Task` and bubbles to the fire-and-forget site. Even after fixing Issue 1, the exception is only observed by the `ContinueWith` logger. The intent stated in the context is that failures should be swallowed after logging — having the catch inside `WriteAsync` itself makes that contract explicit and keeps the fix robust regardless of how `WriteAsync` is called in the future.

**Fix:** A `try/catch (Exception ex)` block wraps the entire body of `WriteAsync`. On failure, `_logger.LogError` records the event type and exception, and the method returns normally (the `Task` completes successfully), so no fault propagates.

**Explanation:** Without a catch block, any exception thrown after an `await` point inside an `async Task` method is captured and stored as the task's fault. The caller must observe it or the process crashes (Issue 1). Catching inside `WriteAsync` means the method always completes successfully from the runtime's point of view, so there is nothing to observe and the `ContinueWith` handler in `Log` never runs (its `OnlyOnFaulted` guard prevents it). The two fixes are complementary: the catch is the primary defense, and the `ContinueWith` is a safety net for any exception path not covered by the catch.

---

### Issue 3: Missing ConfigureAwait(false) in background task

**Problem:** `await db.InsertAsync(evt)` without `ConfigureAwait(false)` tries to resume on the captured `SynchronizationContext`. In ASP.NET Core there is no ambient context by default, so in practice this rarely deadlocks, but in older ASP.NET or in test hosts that install a single-threaded context, the continuation can deadlock waiting for the context to be free.

**Fix:** `await db.InsertAsync(evt).ConfigureAwait(false)` is used so the continuation runs on any available thread-pool thread rather than attempting to re-enter a synchronization context.

**Explanation:** `ConfigureAwait(false)` tells the scheduler not to capture the current `SynchronizationContext` or `TaskScheduler`. For fire-and-forget background work that does not touch ASP.NET request state (HttpContext, etc.), there is no reason to marshal back to the original context. Omitting it is low-risk in ASP.NET Core today but becomes a bug if this code runs in a context with a single-threaded scheduler (WinForms, WPF, or certain unit test runners). Adding it is a correctness habit that prevents subtle future breakage when the code is reused.
