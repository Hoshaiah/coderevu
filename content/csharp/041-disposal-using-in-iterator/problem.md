---
slug: disposal-using-in-iterator
track: csharp
orderIndex: 41
title: Yield Return Skips Disposal
difficulty: hard
tags:
  - disposal
  - linq
  - iterators
language: csharp
---

## Context

`CsvRowReader.cs` is a low-level utility in a data-import pipeline that yields parsed rows from a CSV file one at a time. It is designed for large files where materialising all rows into a `List<T>` would exhaust memory. Callers use it with LINQ: `reader.ReadRows(path).Where(...).Take(100)` etc.

A file handle leak was detected in production via a `lsof` audit: after an import job finishes, the input CSV files remain open. The server eventually hits the OS open-file limit (`EMFILE`) and imports start failing. The problem does not appear when callers read all rows to completion — only when callers use `Take`, `First`, `Any`, or break out of a `foreach` early.

The team checked that the `StreamReader` is wrapped in a `using` block and assumed that was sufficient. A junior developer pointed out that the files are indeed open while imports are running, which seemed correct, but the senior developer confirmed they should be closed after the import completes.

## Buggy code

```csharp
public class CsvRowReader
{
    public IEnumerable<string[]> ReadRows(string filePath)
    {
        using var reader = new StreamReader(filePath);

        // skip header
        reader.ReadLine();

        while (!reader.EndOfStream)
        {
            var line = reader.ReadLine();
            if (line is null) break;

            yield return line.Split(',');
        }
    }
}
```
