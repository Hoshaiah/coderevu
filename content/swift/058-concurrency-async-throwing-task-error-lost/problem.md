---
slug: concurrency-async-throwing-task-error-lost
track: swift
orderIndex: 58
title: Thrown Error Silently Dropped in Task
difficulty: medium
tags:
  - concurrency
  - error-handling
  - async-await
  - task
language: swift
---

## Context

This code is in `UploadService.swift`, a service class that uploads user-generated content to a server. It exposes a `beginUpload` method that fires off an async task from a synchronous call site (a UIKit button tap handler). The team wants upload errors to be surfaced to the user via a completion callback.

Users and QA testers report that uploads silently fail — the loading spinner disappears, no error alert appears, and the content never appears on the server. Network logs show that the server does return 4xx and 5xx errors. The `onError` closure passed to `beginUpload` is never called when a network error occurs.

The team added logging inside `performUpload` and confirmed it is reached and throws. They also verified the `onError` closure captures the right view controller reference. The bug is in how the `Task` is constructed around the throwing call.

## Buggy code

```swift
class UploadService {
    func beginUpload(data: Data,
                     onSuccess: @escaping () -> Void,
                     onError: @escaping (Error) -> Void) {
        Task {
            try await performUpload(data: data)
            await MainActor.run { onSuccess() }
        }
    }

    private func performUpload(data: Data) async throws {
        let (_, response) = try await URLSession.shared.upload(
            for: URLRequest(url: URL(string: "https://api.example.com/upload")!),
            from: data
        )
        guard let http = response as? HTTPURLResponse,
              (200..<300).contains(http.statusCode) else {
            throw UploadError.serverError
        }
    }
}

enum UploadError: Error {
    case serverError
}
```
