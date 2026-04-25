---
slug: retain-cycle-delegate
track: swift
orderIndex: 24
title: Delegate Strong Reference Retain Cycle
difficulty: easy
tags:
  - memory
  - arc
  - delegation
  - retain-cycle
language: swift
---

## Context

This code lives in `NetworkManager.swift`, a singleton that handles all URLSession work for an iOS app. The `NetworkManagerDelegate` protocol notifies a view controller when downloads complete. The view controller sets itself as the delegate in `viewDidLoad`.

Users report that memory usage climbs steadily over the app's lifetime. Instruments shows that `HomeViewController` instances accumulate — each push/pop of the home screen leaves a leaked instance. The network manager itself is never released because it is a singleton.

The team already confirmed the leak is not coming from closures; capturing lists were audited. The delegate pattern was added three sprints ago and the leak timing correlates exactly with that change.

## Buggy code

```swift
protocol NetworkManagerDelegate: AnyObject {
    func didFinishDownload(data: Data)
    func didFailWithError(_ error: Error)
}

class NetworkManager {
    static let shared = NetworkManager()

    var delegate: NetworkManagerDelegate?

    private init() {}

    func startDownload(url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let self = self else { return }
            if let error = error {
                self.delegate?.didFailWithError(error)
            } else if let data = data {
                self.delegate?.didFinishDownload(data: data)
            }
        }.resume()
    }
}

class HomeViewController: UIViewController, NetworkManagerDelegate {
    override func viewDidLoad() {
        super.viewDidLoad()
        NetworkManager.shared.delegate = self
    }

    func didFinishDownload(data: Data) {
        // update UI
    }

    func didFailWithError(_ error: Error) {
        // show alert
    }
}
```
