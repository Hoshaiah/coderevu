---
slug: weak-self-capture-nil-crash
track: swift
orderIndex: 27
title: Weak Self Capture Nil Dereference
difficulty: easy
tags:
  - memory
  - closures
  - arc
language: swift
---

## Context

This code lives in `ProfileViewController.swift`, a UIKit view controller responsible for loading and displaying a user's profile from a remote API. The controller fires a network request in `viewDidLoad` and updates the UI in a completion handler. The surrounding stack uses URLSession with a custom `APIClient` wrapper.

Crashes appear in production with `EXC_BAD_ACCESS` or `Fatal error: Unexpectedly found nil while unwrapping an Optional value` shortly after users navigate away from the Profile screen quickly — especially on slow network connections. The crash trace points to the label assignment inside the completion closure.

Developers added `[weak self]` to avoid a retain cycle, which was the right call, but the fix introduced a new problem that only surfaces when the view controller has already been deallocated before the response arrives.

## Buggy code

```swift
import UIKit

class ProfileViewController: UIViewController {
    @IBOutlet weak var nameLabel: UILabel!
    @IBOutlet weak var bioLabel: UILabel!

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        apiClient.fetchProfile { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let profile):
                    self!.nameLabel.text = profile.name
                    self!.bioLabel.text = profile.bio
                case .failure(let error):
                    self!.showError(error)
                }
            }
        }
    }

    private func showError(_ error: Error) {
        // show alert
    }
}
```
