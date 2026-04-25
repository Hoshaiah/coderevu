---
slug: async-task-not-awaited
track: csharp
orderIndex: 10
title: Fire-and-Forget Task Loses Errors
difficulty: medium
tags:
  - async
  - error-handling
  - background-work
language: csharp
---

## Context

This code is in `Services/NotificationService.cs`. After a user places an order, the service sends a confirmation email. The email sending is intentionally done on a background path — the team did not want email latency to slow down the order confirmation response. The code was written by a developer familiar with fire-and-forget patterns.

Users occasionally report not receiving confirmation emails. Application logs show no email-related errors. The team added explicit error logging inside `SendEmailAsync` and confirmed it fires for some orders — yet those log lines never appear in production. Metrics show the email queue backing up but no delivery failures recorded.

A junior developer noticed that when `SendEmailAsync` throws (e.g. when the SMTP server is unreachable), the exception silently disappears. The team wants failures to at least be logged, and they want to understand why the errors are invisible.

## Buggy code

```csharp
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
        SendEmailAsync(order);
    }

    private async Task SendEmailAsync(Order order)
    {
        var message = BuildMessage(order);
        await _emailSender.SendAsync(message);
        _logger.LogInformation("Confirmation sent for order {OrderId}", order.Id);
    }

    private EmailMessage BuildMessage(Order order) =>
        new EmailMessage(order.CustomerEmail, $"Order #{order.Id} confirmed");
}
```
