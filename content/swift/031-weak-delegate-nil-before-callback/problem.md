---
slug: weak-delegate-nil-before-callback
track: swift
orderIndex: 31
title: Weak Delegate Nil on Callback
difficulty: easy
tags:
  - memory
  - arc
  - delegate
language: swift
---

## Context

`ImageDownloader.swift` is a lightweight helper used throughout a photo-sharing app to fetch remote images off the main thread. It holds a `weak` reference to a delegate so it doesn't form a retain cycle with view controllers. This is the standard recommended pattern and passes code review.

Users notice that the profile image sometimes never appears after navigating to a profile and immediately scrolling. The callback is never invoked visually, but nothing is logged as an error either. Instruments shows the download completes successfully — bytes arrive over the network — yet the UI never updates.

The team has verified the network layer is correct and the delegate method is implemented. The bug is invisible in unit tests because tests hold a strong reference to the delegate for the duration of the test.

## Buggy code

```swift
protocol ImageDownloaderDelegate: AnyObject {
    func imageDownloader(_ downloader: ImageDownloader,
                         didFinish image: UIImage)
}

final class ImageDownloader {
    weak var delegate: ImageDownloaderDelegate?
    private let url: URL

    init(url: URL) {
        self.url = url
    }

    func start() {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let self, error == nil,
                  let data,
                  let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                self.delegate?.imageDownloader(self, didFinish: image)
            }
        }.resume()
    }
}

// Call site in ProfileViewController
func loadAvatar() {
    let downloader = ImageDownloader(url: avatarURL)
    downloader.delegate = self
    downloader.start()
    // downloader goes out of scope here
}
```
