---
slug: concurrency-mainactor-sync-in-detached-task
track: swift
orderIndex: 71
title: Synchronous MainActor Call in Detached Task
difficulty: hard
tags:
  - concurrency
  - main-actor
  - async-await
  - deadlock
language: swift
---

## Context

This code lives in `ReportExporter.swift`, a utility that generates a PDF report in the background and then saves it to disk. It is called from a toolbar button in a UIKit view controller. The export is intentionally run off the main thread because report generation can take several seconds. The method reads some UI state (a date range) before kicking off the background work.

Users report that tapping the "Export" button freezes the app completely. The freeze is permanent — the app must be force-quit. This only happens on device; the simulator seems fine. Thread sanitizer shows no data races. No crash logs are generated because the process never actually crashes.

The team verified that `generatePDF()` does not itself block. They added logging and confirmed execution reaches the `Task.detached` block but never progresses past the `MainActor.run` call inside it.

## Buggy code

```swift
class ReportExporter {
    @MainActor
    func exportReport(dateRange: ClosedRange<Date>) {
        let range = dateRange
        Task.detached(priority: .userInitiated) {
            // Get some extra UI state synchronously from the main actor
            let title = await MainActor.run {
                return UIApplication.shared.windows.first?.rootViewController?.title ?? "Report"
            }

            let pdfData = generatePDF(range: range, title: title)

            // Save result back on main actor
            await MainActor.run {
                self.savePDF(pdfData)
            }
        }
    }

    private func generatePDF(range: ClosedRange<Date>, title: String) -> Data {
        // Heavy synchronous work
        return Data()
    }

    @MainActor
    private func savePDF(_ data: Data) {
        // Write to disk and update UI
    }
}
```
