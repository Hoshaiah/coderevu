---
slug: async-main-actor-blocking-sync-call
track: swift
orderIndex: 54
title: Sync Call Blocks MainActor
difficulty: medium
tags:
  - concurrency
  - main-actor
  - performance
language: swift
---

## Context

`ReportExporter.swift` is called from a menu action in a document-based macOS app. When the user exports a large report, the app UI freezes for several seconds. The export is supposed to be asynchronous — the function is marked `async` and called with `await`. The hang shows up in Time Profiler as the main thread blocked inside `ReportExporter.export()`.

The developer marked the function `@MainActor` because it reads from a view model. The function was later expanded to include a synchronous JSON-serialisation step that can take 2–3 seconds for large datasets. That step was pulled in from a utility library without checking its threading characteristics.

Everything compiles cleanly and the function is `async`, so the developer assumed the heavy work would not block the UI. The misunderstanding is about what `async` and `@MainActor` actually guarantee.

## Buggy code

```swift
import Foundation

@MainActor
final class ReportExporter {
    private let viewModel: ReportViewModel

    init(viewModel: ReportViewModel) {
        self.viewModel = viewModel
    }

    func export() async throws -> Data {
        // Read state from the view model (requires MainActor)
        let snapshot = viewModel.currentSnapshot()

        // Synchronously serialise — this can take 2-3 seconds for large reports
        let data = LegacySerializer.toJSON(snapshot)  // blocking, no await

        // Write to a temp file
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("report.json")
        try data.write(to: url)
        return data
    }
}
```
