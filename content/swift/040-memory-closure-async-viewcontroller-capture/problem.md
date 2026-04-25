---
slug: memory-closure-async-viewcontroller-capture
track: swift
orderIndex: 40
title: Async Closure Captures Dismissed Controller
difficulty: medium
tags:
  - memory
  - arc
  - closures
  - async-await
language: swift
---

## Context

This code is in `ExportViewController.swift`, a sheet that lets users export their data. When the export button is tapped, an async `Task` starts a long-running export. The sheet can be dismissed by the user mid-export. The controller updates a progress label as the export proceeds.

After the sheet is dismissed, log output still shows the progress label being updated and the export continuing to reference the view controller. Instruments shows the view controller is never released as long as the export is running, even after dismissal. On exports taking more than 30 seconds, users report the app is noticeably heavier on memory.

The team considered adding a cancel button, but even without that, they expect the dismissed controller to be freed immediately. They checked the delegate and dataSource properties and neither is the issue.

## Buggy code

```swift
class ExportViewController: UIViewController {
    private var progressLabel: UILabel = UILabel()
    private var exportTask: Task<Void, Never>?

    @IBAction func startExportTapped(_ sender: UIButton) {
        exportTask = Task {
            await runExport()
        }
    }

    private func runExport() async {
        for i in 1...100 {
            guard !Task.isCancelled else { return }
            await performExportStep(i)
            self.progressLabel.text = "Step \(i) of 100"
        }
    }

    private func performExportStep(_ step: Int) async {
        try? await Task.sleep(nanoseconds: 300_000_000)
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        // Attempt to clean up
        exportTask = nil
    }
}
```
