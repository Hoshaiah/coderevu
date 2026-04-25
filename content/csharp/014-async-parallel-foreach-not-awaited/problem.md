---
slug: async-parallel-foreach-not-awaited
track: csharp
orderIndex: 14
title: Parallel Async Lambdas Not Awaited
difficulty: medium
tags:
  - async
  - concurrency
  - task
language: csharp
---

## Context

This code is in `Jobs/EmailDispatchJob.cs` in a .NET 7 worker service that sends promotional emails in batches. The `DispatchBatchAsync` method processes a list of recipients and fires an email for each one using an injected `IEmailService`. The method is called from a hosted service that waits for it to complete before marking the batch as sent.

The batch is marked as "sent" almost instantly even for batches of 1 000 recipients, but many emails are never actually delivered. The email service logs show far fewer "email sent" entries than expected. Under high load the process occasionally crashes with `TaskScheduler.UnobservedTaskException`.

The team added `Parallel.ForEach` to speed up dispatch and assumed the `async` lambda would be awaited as part of the loop.

## Buggy code

```csharp
public class EmailDispatchJob
{
    private readonly IEmailService _email;
    private readonly ILogger<EmailDispatchJob> _logger;

    public EmailDispatchJob(IEmailService email, ILogger<EmailDispatchJob> logger)
    {
        _email = email;
        _logger = logger;
    }

    public async Task DispatchBatchAsync(
        IReadOnlyList<Recipient> recipients,
        CancellationToken ct)
    {
        Parallel.ForEach(recipients, async recipient =>
        {
            await _email.SendAsync(recipient.Address, recipient.Name, ct);
            _logger.LogInformation("Email sent to {Address}", recipient.Address);
        });

        _logger.LogInformation("Batch of {Count} dispatched.", recipients.Count);
    }
}
```
