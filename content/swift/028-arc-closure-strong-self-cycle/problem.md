---
slug: arc-closure-strong-self-cycle
track: swift
orderIndex: 28
title: Retain Cycle in Completion Closure
difficulty: easy
tags:
  - memory
  - arc
  - closures
  - retain-cycle
language: swift
---

## Context

`ProfileViewController.swift` is a UIKit view controller that loads user profile data from a network service. When the view appears it kicks off a data fetch and assigns the result to a label. The `NetworkClient` stores the completion closure until the request finishes or is cancelled.

Testers noticed that navigating away from the profile screen and back many times causes memory usage to climb steadily. Instruments shows `ProfileViewController` instances accumulating — they are never deallocated even after the user navigates to another screen. There are no other strong references to `ProfileViewController` visible in the navigation stack after a pop.

The `NetworkClient` itself is a singleton injected as a property. The team already verified that the `NetworkClient` does not hold a strong reference to any view controller directly — only through the closure it was given.

## Buggy code

```swift
import UIKit

class ProfileViewController: UIViewController {
    private let client: NetworkClient
    private var taskID: UUID?

    @IBOutlet private weak var nameLabel: UILabel!

    init(client: NetworkClient) {
        self.client = client
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        taskID = client.fetchProfile { result in
            switch result {
            case .success(let profile):
                self.nameLabel.text = profile.displayName
            case .failure(let error):
                self.nameLabel.text = "Error: \(error.localizedDescription)"
            }
        }
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if let id = taskID { client.cancel(id) }
    }
}
```
