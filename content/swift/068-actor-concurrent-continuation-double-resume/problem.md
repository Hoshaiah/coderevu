---
slug: actor-concurrent-continuation-double-resume
track: swift
orderIndex: 68
title: Continuation Resumed Twice in Actor
difficulty: hard
tags:
  - concurrency
  - actor
  - async-await
  - correctness
language: swift
---

## Context

This code is in `BluetoothManager.swift`, which wraps a CoreBluetooth peripheral connection into a modern `async` API using `withCheckedContinuation`. The actor manages a single pending connection continuation and resumes it when the delegate callback fires. The `connect()` method is called from async contexts in the app.

The app crashes intermittently with `SWIFT TASK CONTINUATION MISUSE: tried to resume a continuation that was already resumed`. The crash occurs most frequently on devices with flaky Bluetooth where a connection attempt triggers both a timeout error path and the success delegate callback in quick succession.

The team confirmed CoreBluetooth can invoke both `didConnect` and error paths under certain race conditions in the underlying framework. They added a flag but the crash still occurs because the flag check and resume are not atomic within the actor.

## Buggy code

```swift
import Foundation
import CoreBluetooth

actor BluetoothManager: NSObject {
    private var pendingContinuation: CheckedContinuation<Void, Error>?
    private var isConnecting = false

    func connect(to peripheral: CBPeripheral) async throws {
        guard !isConnecting else { return }
        isConnecting = true
        try await withCheckedThrowingContinuation { continuation in
            self.pendingContinuation = continuation
            peripheral.delegate = self
            // Simulate initiating connection
        }
    }

    func handleConnected() {
        if isConnecting {
            isConnecting = false
            pendingContinuation?.resume(returning: ())
        }
    }

    func handleError(_ error: Error) {
        if isConnecting {
            isConnecting = false
            pendingContinuation?.resume(throwing: error)
        }
    }
}

extension BluetoothManager: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral,
                                 didDiscoverServices error: Error?) {
        Task {
            if let error = error {
                await handleError(error)
            } else {
                await handleConnected()
            }
        }
    }
}
```
