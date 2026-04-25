---
slug: async-void-swallows
track: csharp
orderIndex: 1
title: "async void event handler swallows exceptions and crashes the process"
difficulty: easy
tags: [async, exceptions, event-handlers]
language: csharp
---

## Context

A WPF app occasionally crashes with `FatalExecutionEngineError` and no stack trace pointing anywhere useful. The pattern shows up after users click the "Sync" button. Unit tests pass. Logging shows the sync work *starts* but nothing is logged from inside it.

## Buggy code

```csharp
public partial class MainWindow : Window
{
    private readonly SyncService _sync;

    public MainWindow(SyncService sync)
    {
        _sync = sync;
        InitializeComponent();
    }

    private async void SyncButton_Click(object sender, RoutedEventArgs e)
    {
        await _sync.RunAsync();
        StatusText.Text = "Done";
    }
}
```
