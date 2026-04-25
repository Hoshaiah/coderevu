---
slug: arc-delegate-strong-reference-cycle
track: swift
orderIndex: 30
title: Strong Delegate Creates Retain Cycle
difficulty: easy
tags:
  - memory
  - arc
  - retain-cycle
  - delegates
language: swift
---

## Context

This download manager lives in `DownloadManager.swift` in a document-viewer app. It uses a delegate pattern to notify its owner (a `DocumentViewController`) when a download completes or fails. The view controller creates a `DownloadManager` in `viewDidLoad` and assigns itself as the delegate.

Users report that navigating away from the document view and back many times causes memory to grow until the app is jettisoned by the OS. Instruments' Leaks template shows persistent `DocumentViewController` and `DownloadManager` instances that are never released after dismissal.

The developer already checked for strong captures in closures and found none. The retain cycle is in the object graph itself, not in any closure.

## Buggy code

```swift
protocol DownloadManagerDelegate: AnyObject {
    func downloadDidFinish(url: URL)
    func downloadDidFail(error: Error)
}

class DownloadManager {
    // BUG: should be weak to avoid retaining the delegate
    var delegate: DownloadManagerDelegate?

    func start(url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let self else { return }
            if let error {
                self.delegate?.downloadDidFail(error: error)
            } else {
                self.delegate?.downloadDidFinish(url: url)
            }
        }.resume()
    }
}

class DocumentViewController: UIViewController, DownloadManagerDelegate {
    var downloadManager: DownloadManager?

    override func viewDidLoad() {
        super.viewDidLoad()
        downloadManager = DownloadManager()
        downloadManager?.delegate = self
    }

    func downloadDidFinish(url: URL) { /* update UI */ }
    func downloadDidFail(error: Error) { /* show alert */ }
}
```
