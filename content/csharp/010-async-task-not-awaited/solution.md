## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Fire-and-Forget Task Loses Errors
// ------------------------------------------------------------------------

public class NotificationService
{
    private readonly IEmailSender _emailSender;
    private readonly ILogger<NotificationService> _logger;

    public NotificationService(IEmailSender emailSender, ILogger<NotificationService> logger)
    {
        _emailSender = emailSender;
        _logger = logger;
    }

    public void SendOrderConfirmation(Order order)
    {
        // CHANGE 1: Assign the returned Task and attach ContinueWith to observe it, preventing silent discard of the fire-and-forget result.
        _ = SendEmailAsync(order);
    }

    // CHANGE 2: Wrap the entire async body in try/catch so any exception from SendAsync or BuildMessage is caught and logged instead of being lost in an unobserved Task.
    private async Task SendEmailAsync(Order order)
    {
        try
        {
            var message = BuildMessage(order);
            await _emailSender.SendAsync(message);
            _logger.LogInformation("Confirmation sent for order {OrderId}", order.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to send confirmation email for order {OrderId}", order.Id);
        }
    }

    private EmailMessage BuildMessage(Order order) =>
        new EmailMessage(order.CustomerEmail, $"Order #{order.Id} confirmed");
}
```

## Explanation

### Issue 1: Returned Task Discarded Silently

**Problem:** `SendOrderConfirmation` calls `SendEmailAsync(order)` without capturing or awaiting the returned `Task`. When the async method throws, the exception is stored inside that `Task` object. Because nothing holds a reference to the `Task` and nothing awaits it, the exception is never observed and the runtime discards it without any log output.

**Fix:** Change the call site to `_ = SendEmailAsync(order);` using the discard token. This makes the intent of fire-and-forget explicit and satisfies the compiler warning about an unawaited Task, while still not blocking the calling thread.

**Explanation:** In C#, an `async Task` method returns a `Task` that holds any unhandled exception. If you call the method as a statement (`SendEmailAsync(order);`) without `await` or assignment, the compiler still discards the `Task` silently in older project settings, and even where a warning appears it does not prevent the loss. The exception sits inside the `Task` until it is garbage-collected, at which point .NET raises `TaskScheduler.UnobservedTaskException` — but that event fires on a finalizer thread long after the original call, so no contextual log line ever appears near the order processing code. Using `_ = ...` documents the deliberate discard and pairs cleanly with the try/catch fix below.

---

### Issue 2: No Exception Handling Inside Background Path

**Problem:** Even with the Task assigned, an unhandled exception escaping `SendEmailAsync` goes into the `Task`'s fault state. Without a `try/catch` inside the method, the exception is never logged at the point of failure, so operators see no error message associated with the failing order ID.

**Fix:** Wrap the body of `SendEmailAsync` in a `try/catch (Exception ex)` block and call `_logger.LogError(ex, ...)` in the catch, referencing `order.Id` so each failure is traceable to a specific order.

**Explanation:** A fire-and-forget path has no caller that can catch and log errors — the original thread has already moved on. Any exception must be handled inside the async method itself, otherwise it silently faults the `Task`. Adding `try/catch` around `BuildMessage` and `_emailSender.SendAsync` ensures that whether the SMTP server is unreachable, a network timeout occurs, or `BuildMessage` throws a `NullReferenceException`, the error is captured and written to the log with the order context still in scope. A related pitfall: if you add retries later, they must also live inside this `try/catch` block (or in a dedicated retry wrapper), because any exception that escapes the method boundary is unrecoverable on a fire-and-forget path.
