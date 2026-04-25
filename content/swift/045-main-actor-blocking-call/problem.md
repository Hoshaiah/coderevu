---
slug: main-actor-blocking-call
track: swift
orderIndex: 45
title: Synchronous Blocking on MainActor
difficulty: medium
tags:
  - concurrency
  - main-actor
  - performance
  - async-await
language: swift
---

## Context

This code is in `DocumentExporter.swift`, part of a document editing app. When the user taps "Export", the app saves the document to a file and shares it. The export function is marked `@MainActor` because it updates UI state (a progress indicator) before and after the export.

Users report the app freezes for several seconds when exporting large documents. The UI becomes completely unresponsive — buttons do not respond, animations stop. On iPad, the system sometimes displays the app-not-responding watchdog dialog.

The developer already moved the URLSession upload to a background task. The remaining freeze is on the file write operation, which the developer thought was fast enough to keep on the main thread.

## Buggy code

```swift
import Foundation
import UIKit

@MainActor
class DocumentExporter {
    var isExporting = false

    func exportDocument(_ document: Document) async throws {
        isExporting = true
        defer { isExporting = false }

        let data = document.render() // fast, in-memory

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString + ".pdf")

        // Write to disk — assumed to be fast for typical documents
        try data.write(to: tempURL, options: .atomic)

        let activityVC = UIActivityViewController(
            activityItems: [tempURL],
            applicationActivities: nil
        )
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first
        scene?.windows.first?.rootViewController?.present(activityVC, animated: true)
    }
}
```
