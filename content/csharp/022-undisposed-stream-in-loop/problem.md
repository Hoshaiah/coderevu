---
slug: undisposed-stream-in-loop
track: csharp
orderIndex: 22
title: Stream Not Disposed in Loop
difficulty: easy
tags:
  - disposal
  - resource-leak
  - io
language: csharp
---

## Context

This ETL worker lives in `Jobs/CsvImportJob.cs` and runs every five minutes via Hangfire. It reads a directory of CSV files uploaded by partners, processes each one, then moves it to an archive folder. The service runs on Windows Server inside IIS.

After a few hours, the job starts throwing `IOException: The process cannot access the file because it is being used by another process` when trying to move files to the archive. Restarting the Hangfire worker clears the issue temporarily. Memory also grows slowly over the lifetime of the process.

The team confirmed no other process is touching the files. A handle-leak checker showed the job process accumulates open file handles proportional to the number of files processed since the last restart.

## Buggy code

```csharp
public class CsvImportJob
{
    private readonly IImportPipeline _pipeline;
    private readonly string _inboxPath;
    private readonly string _archivePath;

    public CsvImportJob(IImportPipeline pipeline, string inboxPath, string archivePath)
    {
        _pipeline = pipeline;
        _inboxPath = inboxPath;
        _archivePath = archivePath;
    }

    public async Task RunAsync()
    {
        var files = Directory.GetFiles(_inboxPath, "*.csv");

        foreach (var filePath in files)
        {
            var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
            try
            {
                await _pipeline.ProcessAsync(stream);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Failed to process {filePath}: {ex.Message}");
                continue;
            }

            var dest = Path.Combine(_archivePath, Path.GetFileName(filePath));
            File.Move(filePath, dest);
        }
    }
}
```
