---
slug: async-when-all-exception-ignored
track: csharp
orderIndex: 7
title: WhenAll Partial Failure Silently Dropped
difficulty: easy
tags:
  - async
  - exceptions
  - task
language: csharp
---

## Context

This method lives in `NotificationDispatcher.cs`, a background service that fans out push notifications to multiple third-party providers (Firebase, APNS, SMS gateway). It is called once per outbound notification batch from a hosted `IHostedService`. Each provider has its own `SendAsync` method that can throw on network errors or bad credentials.

Operators noticed that some users occasionally do not receive notifications even though the logs show the batch was "dispatched successfully." The error rate is around 5% of batches, always correlated with the SMS gateway being briefly unavailable. No exception is ever logged from inside the dispatcher.

The team added more logging throughout `SendAsync` and confirmed the gateway throws `HttpRequestException` during those windows. Yet the dispatcher method's catch block never fires and the "dispatched successfully" log always prints. The bug has been present since the initial implementation.

## Buggy code

```csharp
public class NotificationDispatcher
{
    private readonly ILogger<NotificationDispatcher> _logger;
    private readonly IReadOnlyList<INotificationProvider> _providers;

    public NotificationDispatcher(
        ILogger<NotificationDispatcher> logger,
        IReadOnlyList<INotificationProvider> providers)
    {
        _logger = logger;
        _providers = providers;
    }

    public async Task DispatchAsync(Notification notification, CancellationToken ct)
    {
        try
        {
            var tasks = _providers
                .Select(p => p.SendAsync(notification, ct))
                .ToList();

            await Task.WhenAll(tasks);

            _logger.LogInformation("Notification {Id} dispatched successfully.", notification.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to dispatch notification {Id}.", notification.Id);
            throw;
        }
    }
}
```
