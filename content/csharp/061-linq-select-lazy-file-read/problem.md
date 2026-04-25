---
slug: linq-select-lazy-file-read
track: csharp
orderIndex: 61
title: Lazy LINQ Over Disposed Reader
difficulty: medium
tags:
  - linq
  - disposal
  - deferred-execution
language: csharp
---

## Context

This utility lives in `Importers/CsvProductImporter.cs` and is responsible for reading product records from a CSV file uploaded to a temp directory. It is called from an API controller action that then filters and pages the results before returning them to the client.

In production the endpoint occasionally returns empty arrays or throws `ObjectDisposedException: Cannot read from a closed TextReader`. The errors are non-deterministic — the same file imported twice in quick succession may succeed once and fail once. In local development the endpoint always works correctly.

The developer suspects a race condition with file cleanup but added logging that confirms the temp file still exists at the time the exception is thrown. They also ruled out encoding issues since the `ObjectDisposedException` clearly points to a closed reader rather than a parse failure.

## Buggy code

```csharp
public class CsvProductImporter
{
    public IEnumerable<Product> Import(string filePath)
    {
        using var reader = new StreamReader(filePath);

        // Skip header
        reader.ReadLine();

        return reader
            .ReadToEnd()
            .Split('\n', StringSplitOptions.RemoveEmptyEntries)
            .Select(line => ParseLine(line));
    }

    private Product ParseLine(string line)
    {
        var parts = line.Split(',');
        return new Product
        {
            Id = int.Parse(parts[0]),
            Name = parts[1].Trim(),
            Price = decimal.Parse(parts[2])
        };
    }
}
```
