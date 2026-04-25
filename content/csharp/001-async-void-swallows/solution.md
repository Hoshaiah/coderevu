## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — async void event handler swallows exceptions and crashes the process
// ------------------------------------------------------------------------
public partial class MainWindow : Window
{
    private readonly SyncService _sync;

    public MainWindow(SyncService sync)
    {
        _sync = sync;
        InitializeComponent();
    }

    // CHANGE 1: Wrap the entire body in try/catch so exceptions from RunAsync() are caught on the UI thread instead of escaping the async void frame. async void is required for event handlers, but that makes unhandled exceptions re-throw on the SynchronizationContext, crashing the process.
    private async void SyncButton_Click(object sender, RoutedEventArgs e)
    {
        // CHANGE 2: Disable the button while work is in-flight to prevent concurrent clicks that could trigger overlapping RunAsync() calls.
        SyncButton.IsEnabled = false;
        try
        {
            await _sync.RunAsync();
            StatusText.Text = "Done";
        }
        // CHANGE 1 (continued): Catch Exception so any fault surfaces as a
        // visible error message rather than a process crash with no stack trace.
        catch (Exception ex)
        {
            StatusText.Text = $"Sync failed: {ex.Message}";
        }
        finally
        {
            // CHANGE 2 (continued): Re-enable the button regardless of outcome.
            SyncButton.IsEnabled = true;
        }
    }
}
```

## Explanation

### Issue 1: Unhandled exception in `async void` crashes process

**Problem:** When `_sync.RunAsync()` throws, the exception propagates out of the `async void` method. WPF re-raises it on the `DispatcherSynchronizationContext`, which has no handler, so the CLR terminates the process. The crash shows up as `FatalExecutionEngineError` with no useful stack trace because the original context is gone by the time the runtime reports it.

**Fix:** A `try/catch (Exception ex)` block wraps the `await _sync.RunAsync()` call. The caught exception is displayed in `StatusText.Text` instead of escaping the method.

**Explanation:** An `async void` method cannot be awaited by the caller, so there is nowhere for the caller to attach a continuation that handles exceptions. When the awaited task faults, the runtime resumes the `async void` continuation and re-throws the stored exception on whatever `SynchronizationContext` was captured — in WPF that is the `Dispatcher`. The `Dispatcher` treats this as an unhandled exception and, by default, calls `Application.Current.Shutdown`. Catching the exception inside the method itself stops it from ever reaching the `Dispatcher`. If you need the full stack trace in production, log `ex` before updating the status text. A related pitfall: rethrowing with `throw;` inside an `async` method is fine, but rethrowing with `throw ex;` loses the original stack, so always use `throw;` if you need to rethrow.

---

### Issue 2: Button stays enabled during async work, allowing concurrent calls

**Problem:** If the user clicks "Sync" a second time before the first call finishes, two `RunAsync()` tasks run concurrently. Depending on what `SyncService` does (file I/O, HTTP, database writes), this can cause data corruption, duplicate records, or a second exception that again crashes the process.

**Fix:** `SyncButton.IsEnabled = false` is set before the `await`, and `SyncButton.IsEnabled = true` is restored in a `finally` block so it is always re-enabled regardless of success or failure.

**Explanation:** `await` yields control back to the UI thread, which continues processing input events. That means the button remains clickable during the entire duration of `RunAsync()`. Setting `IsEnabled = false` before the `await` blocks the UI from dispatching a second click event while work is in progress. The `finally` block guarantees the button comes back regardless of whether the task succeeded or threw. Without `finally`, a failure path that skips the re-enable line leaves the button permanently disabled for the rest of the session.
