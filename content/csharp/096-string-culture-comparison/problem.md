---
slug: string-culture-comparison
track: csharp
orderIndex: 96
title: >-
  Locale-sensitive string comparison causes silent data mismatches in Turkish
  deployments
difficulty: medium
tags:
  - correctness
  - globalization
  - string-comparison
  - culture
language: csharp
---

## Context

A SaaS platform routes incoming webhooks to customer integrations by matching an `eventType` field (e.g. `"invoice.created"`) against a registry of registered handlers. Everything works in CI (English locale) and in US/EU data centers. Customers hosted in Turkey report that some events are never delivered even though the handler is registered correctly.

## Buggy code

```csharp
public class WebhookRouter
{
    private readonly Dictionary<string, Func<string, Task>> _handlers = new();

    public void Register(string eventType, Func<string, Task> handler)
    {
        _handlers[eventType.ToUpper()] = handler;
    }

    public async Task RouteAsync(string eventType, string payload)
    {
        var key = eventType.ToUpper();
        if (_handlers.TryGetValue(key, out var handler))
        {
            await handler(payload);
        }
        else
        {
            Console.WriteLine($"No handler registered for event: {eventType}");
        }
    }
}
```
