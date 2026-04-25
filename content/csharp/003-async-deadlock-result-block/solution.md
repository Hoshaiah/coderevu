## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Async Result Block Deadlocks
// ------------------------------------------------------------------------

public class ReportController : Controller
{
    private readonly ReportService _reports;

    public ReportController(ReportService reports)
    {
        _reports = reports;
    }

    // CHANGE 2: Return Task<ActionResult> and mark async so the MVC pipeline can schedule continuations without blocking the request thread.
    public async Task<ActionResult> Download(int reportId)
    {
        // CHANGE 1: Use await instead of .Result so the continuation is posted back without needing to hold the SynchronizationContext thread, breaking the deadlock.
        var data = await _reports.GenerateAsync(reportId);

        var file = new FileContentResult(data, "application/pdf");
        file.FileDownloadName = $"report-{reportId}.pdf";
        return file;
    }
}
```

## Explanation

### Issue 1: Blocking on Task.Result Deadlocks Under ASP.NET

**Problem:** Requests to `Download` hang forever. IIS threads accumulate and eventually the app pool recycles. The same code works fine in a console app, which has no `SynchronizationContext`.

**Fix:** Replace `.Result` with `await` on the call to `_reports.GenerateAsync(reportId)`. This is the only change to the expression on that line.

**Explanation:** ASP.NET MVC 4 installs an `AspNetSynchronizationContext` on every request thread. When `GenerateAsync` is called, the `async` machinery inside it captures that context so it can marshal the continuation back onto the same logical request context when the task completes. Then `.Result` is called, which blocks the request thread waiting for the task to finish. Now the continuation needs that exact thread (or at least a thread allowed into that context) to resume — but the thread is blocked. Neither side can proceed, so the request hangs indefinitely. Increasing `minWorkerThreads` makes it worse because each new request adds another blocked thread competing for the same context slot. Using `await` instead releases the request thread back to the pool while the I/O runs, so when `GenerateAsync` completes its continuation can freely re-enter the context and execution resumes normally.

---

### Issue 2: Synchronous Action Signature Prevents Async Execution

**Problem:** Even if someone attempts to fix the deadlock by restructuring the body, declaring the method as `ActionResult` (not `Task<ActionResult>`) means MVC 4 treats the action as fully synchronous and does not integrate with its async action pipeline at all.

**Fix:** Change the method signature from `public ActionResult Download(int reportId)` to `public async Task<ActionResult> Download(int reportId)`, adding the `async` modifier and wrapping the return type in `Task<>`.

**Explanation:** MVC 4 detects async actions by checking whether the return type is `Task` or `Task<T>` (or by inheriting `AsyncController`). A plain `ActionResult` return type tells MVC to dispatch the action synchronously and block until it returns — there is no hook for the framework to yield the thread during execution. Adding `async Task<ActionResult>` opts the action into MVC's async action invoker, which cooperates with `await` inside the method body to release and reclaim the request thread correctly. Without this change, even adding `await` inside the body would require a compiler error or a forced synchronous wrapper. The `async` keyword on its own does nothing observable at runtime; it is the `Task<ActionResult>` return type that signals MVC to use its async dispatch path.
