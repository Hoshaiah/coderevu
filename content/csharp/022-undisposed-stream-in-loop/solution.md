## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Stream Not Disposed in Loop
// ------------------------------------------------------------------------

public class CsvImportJob
{
    private readonly IImportPipeline _pipeline;
    private readonly string _inboxPath;
    private readonly string _archivePath;

    public CsvImportJob(IImportPipeline pipeline, string inboxPath, string archivePath)
    {
        _pipeline = pipeline;
        _inboxPath = inboxPath;
        _archivePath = archivePath;
    }

    public async Task RunAsync()
    {
        var files = Directory.GetFiles(_inboxPath, "*.csv");

        foreach (var filePath in files)
        {
            // CHANGE 1: Wrap FileStream in a using declaration so it is disposed on every exit path (success, exception, or continue), releasing the file handle before File.Move runs.
            await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
            try
            {
                await _pipeline.ProcessAsync(stream);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Failed to process {filePath}: {ex.Message}");
                continue;
            }

            // CHANGE 3: Move File.Move inside its own try/catch so a failed move is logged and does not silently skip cleanup or crash the loop.
            try
            {
                var dest = Path.Combine(_archivePath, Path.GetFileName(filePath));
                File.Move(filePath, dest);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Failed to archive {filePath}: {ex.Message}");
            }
        }
    }
}
```

## Explanation

### Issue 1: FileStream never disposed on success path

**Problem:** Every time a file is processed successfully, the `FileStream` object is created but its `Dispose` method is never called. The OS file handle stays open. After processing enough files, the process accumulates hundreds of open handles, and the subsequent `File.Move` call on the same path throws `IOException` because the handle is still held by the job process itself.

**Fix:** Replace the bare `new FileStream(...)` assignment with `await using var stream = new FileStream(...)`. The `await using` declaration ensures `DisposeAsync` is called at the end of each loop iteration regardless of which exit path is taken.

**Explanation:** A `FileStream` wraps a Win32 file handle. Until `Dispose` is called, the OS keeps that handle open and associates it with the process. `File.Move` requires exclusive access on Windows; even the process that owns the handle cannot move the file while the handle is open. The `using` pattern hooks into the C# compiler's control-flow analysis to insert a `finally`-style disposal at every exit point of the scope. Without it, each loop iteration leaks one handle, which is why memory and handle counts grow proportionally to files processed and why a worker restart (which closes all handles) temporarily fixes the symptom.

---

### Issue 2: FileStream never disposed on exception path

**Problem:** When `_pipeline.ProcessAsync` throws, the `catch` block logs the error and executes `continue`, jumping to the next loop iteration. At that point the `FileStream` from the current iteration is still open and unreferenced — it will eventually be collected by the GC finalizer, but the timing is non-deterministic. Under load, the GC may not run soon enough, so handles accumulate.

**Fix:** The same `await using var stream` declaration from CHANGE 1 also fixes this path. Because `await using` is scoped to the enclosing block, disposal happens after the `catch`/`continue` no matter which branch runs.

**Explanation:** The C# `using` declaration desugars to a `try/finally` around the rest of the block. Even when `continue` transfers control out of the loop body, the compiler-generated `finally` fires first and calls `DisposeAsync`. Relying on the GC finalizer (`~FileStream`) instead is unsafe in long-running services: the finalizer thread runs on its own schedule, and IIS worker recycling or memory pressure can mean many handles stay open for minutes. Always dispose `IDisposable`/`IAsyncDisposable` explicitly.

---

### Issue 3: File.Move outside try/catch silently breaks the loop

**Problem:** `File.Move` is called after the `try/catch` block, so any exception it throws (permissions error, destination already exists, disk full) propagates uncaught out of the `foreach` body and stops processing the remaining files in the batch with no log entry.

**Fix:** Wrap `File.Move` and the `dest` path construction in their own `try/catch (Exception ex)` block (CHANGE 3) that logs the failure and lets the loop continue to the next file.

**Explanation:** Once the stream is properly disposed (CHANGE 1), `File.Move` can succeed, but it can still fail for other reasons: the archive directory doesn't exist, two Hangfire workers run concurrently on the same inbox, or the destination file already exists from a prior partial run. Without a surrounding `try/catch`, the first such failure silently abandons all remaining files in the current batch. Wrapping it separately from the `ProcessAsync` try/catch keeps the two failure modes distinct in the logs and ensures one bad archive operation doesn't block healthy files.
