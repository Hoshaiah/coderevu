---
slug: task-unstructured-viewdisappear-leak
track: swift
orderIndex: 47
title: Unstructured Task Outlives View
difficulty: medium
tags:
  - concurrency
  - memory
  - async-await
  - swiftui
language: swift
---

## Context

This code is in `ImageGalleryView.swift`, a SwiftUI view that loads a list of images from a remote API when it appears. Each `ImageGalleryView` is pushed onto a navigation stack and popped when the user goes back. The app fetches images using `URLSession` via an injected `ImageService`.

Users notice that navigating away and back quickly causes duplicate network requests and occasionally shows stale images from a previous navigation session. Memory profiler shows `ImageService` tasks still running after the view is popped. On slow networks this is particularly noticeable — images from the previous screen flash into the new one.

The team added `.onDisappear` to cancel work, but the cancel call only sets a local flag that isn't connected to the running task.

## Buggy code

```swift
import SwiftUI

struct ImageItem: Identifiable { let id: String; let url: URL }

class ImageService {
    func fetchImages() async throws -> [ImageItem] {
        try await Task.sleep(nanoseconds: 1_000_000_000)
        return []
    }
}

struct ImageGalleryView: View {
    let service: ImageService
    @State private var images: [ImageItem] = []
    @State private var isLoading = false

    var body: some View {
        List(images) { item in
            Text(item.id)
        }
        .onAppear {
            isLoading = true
            Task {
                do {
                    let result = try await service.fetchImages()
                    images = result
                } catch {
                    print("Fetch error: \(error)")
                }
                isLoading = false
            }
        }
        .onDisappear {
            isLoading = false
        }
    }
}
```
