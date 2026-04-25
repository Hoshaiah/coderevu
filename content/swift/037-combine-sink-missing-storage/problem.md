---
slug: combine-sink-missing-storage
track: swift
orderIndex: 37
title: Combine Subscription Immediately Cancelled
difficulty: medium
tags:
  - memory
  - combine
  - arc
  - concurrency
language: swift
---

## Context

This code is in `NotificationBannerViewModel.swift`, which subscribes to a `PassthroughSubject` published by a `NotificationService` singleton. The view model is supposed to display a banner whenever a push notification arrives while the app is in the foreground. The subscription is set up in `init`.

Developers notice that the banner never appears when a notification arrives, even though unit tests for `NotificationService` confirm it publishes events correctly. Adding a breakpoint inside the `sink` closure shows it is never hit after the first event (which itself doesn't fire). The code compiles cleanly and there are no warnings.

The team verified that `NotificationService.shared.notificationPublisher` emits events by subscribing with a test sink in a unit test — that works fine.

## Buggy code

```swift
import Foundation
import Combine

class NotificationService {
    static let shared = NotificationService()
    let notificationPublisher = PassthroughSubject<String, Never>()
}

final class NotificationBannerViewModel: ObservableObject {
    @Published var currentBanner: String?

    init() {
        NotificationService.shared.notificationPublisher
            .sink { [weak self] message in
                self?.currentBanner = message
            }
    }

    func dismiss() {
        currentBanner = nil
    }
}
```
