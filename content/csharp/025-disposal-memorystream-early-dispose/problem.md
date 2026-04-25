---
slug: disposal-memorystream-early-dispose
track: csharp
orderIndex: 25
title: MemoryStream Disposed Before Read
difficulty: easy
tags:
  - disposal
  - streams
  - async
language: csharp
---

## Context

This code lives in `Serialization/JsonSerializer.cs` in an ASP.NET Core 6 API. The `SerializeToStreamAsync` method is used to write a JSON payload into a `PipeWriter` before returning a response. It was factored out of a controller action to be shared across multiple endpoints.

The API intermittently returns HTTP 500 with the message `Cannot access a closed Stream` or returns a truncated/empty body. The issue appears more often under load when the thread pool is busy, but sometimes occurs on the very first request after a cold start.

Developers confirmed the `Serialize` call itself works — unit tests that inspect the `MemoryStream` contents inline pass every time. The problem only surfaces when the stream is used after the method returns.

## Buggy code

```csharp
public class JsonSerializer
{
    private readonly System.Text.Json.JsonSerializerOptions _options;

    public JsonSerializer(System.Text.Json.JsonSerializerOptions options)
    {
        _options = options;
    }

    public async Task SerializeToStreamAsync<T>(
        T value,
        PipeWriter writer,
        CancellationToken ct)
    {
        using var ms = new MemoryStream();
        System.Text.Json.JsonSerializer.Serialize(ms, value, _options);
        ms.Position = 0;

        await ms.CopyToAsync(writer.AsStream(), ct);
    }
}
```
