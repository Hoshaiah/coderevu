---
slug: disposal-reader-not-disposed-on-exception
track: csharp
orderIndex: 26
title: StreamReader Leaked on Parse Error
difficulty: easy
tags:
  - disposal
  - resource-management
  - io
  - error-handling
language: csharp
---

## Context

This utility method is in `Parsers/CsvParser.cs` and reads a local configuration file during application startup. It is called once per startup but the file path is provided by the operator and may point to malformed files during deployments. The parsed result is used to populate an in-memory routing table.

Operators report that after a bad config file is deployed and the service is restarted, subsequent attempts to replace the file fail with "The process cannot access the file because it is being used by another process". The service must be killed entirely before the file can be overwritten. Windows Event Log shows no crash — the service appears healthy aside from the locked file.

A code review candidate noticed that the method has a `try/catch` block and assumed it handled cleanup correctly. The actual issue is that the reader is only disposed on the success path.

## Buggy code

```csharp
public IReadOnlyList<RouteEntry> ParseConfigFile(string filePath)
{
    var reader = new StreamReader(filePath);
    var entries = new List<RouteEntry>();

    try
    {
        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#"))
                continue;

            var parts = line.Split(',');
            if (parts.Length != 3)
                throw new FormatException($"Invalid line: {line}");

            entries.Add(new RouteEntry(parts[0].Trim(), parts[1].Trim(), int.Parse(parts[2].Trim())));
        }

        reader.Dispose();
    }
    catch (FormatException ex)
    {
        throw new ConfigurationException("Config file is malformed.", ex);
    }

    return entries;
}
```
