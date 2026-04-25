---
slug: disposal-stream-not-flushed
track: csharp
orderIndex: 24
title: StreamWriter Buffered Data Lost on Dispose
difficulty: easy
tags:
  - disposal
  - io
  - correctness
language: csharp
---

## Context

This code lives in `CsvExporter.cs`, a reporting utility in an internal HR dashboard. It writes employee data to a temporary CSV file on disk, which is then picked up by a nightly SFTP upload job. The file is created and a `FileStream` is opened, but a wrapper `StreamWriter` handles the actual text writing.

Operation staff report that CSV files occasionally arrive at the SFTP destination truncated — the last few rows are missing. The size of the truncation varies: sometimes it is a few bytes, sometimes several kilobytes. The file is always created and never zero-length. The upload job has been verified to be reading the complete on-disk file, so the issue is in the write path.

A developer checked that no exceptions are thrown during the write loop. The bug only appears for large exports (> 10 000 rows); small test exports always look correct, which hinted at a buffering issue.

## Buggy code

```csharp
public class CsvExporter
{
    public void Export(IEnumerable<Employee> employees, string outputPath)
    {
        var fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write);
        var writer = new StreamWriter(fs);

        writer.WriteLine("Id,Name,Department,Salary");

        foreach (var emp in employees)
        {
            writer.WriteLine(
                $"{emp.Id},{Escape(emp.Name)},{Escape(emp.Department)},{emp.Salary:F2}");
        }

        fs.Dispose();
    }

    private static string Escape(string value) =>
        value.Contains(',') ? $"\"{ value}\"" : value;
}
```
