---
slug: async-await-missing-main-actor-ui-update
track: swift
orderIndex: 42
title: UI Update Off Main Thread Async
difficulty: easy
tags:
  - concurrency
  - mainactor
  - async-await
  - correctness
language: swift
---

## Context

This code is in `ArticleDetailViewController.swift`, a UIKit view controller that fetches article body text from a REST API when the view loads. The fetch is performed with `async/await` via a `Task` in `viewDidLoad`. The result is assigned directly to a `UILabel`.

Users report occasional purple runtime warnings in Xcode: "UILabel.text must be used from main thread only." In production, some users see momentary blank labels or rare crashes. The issue is intermittent and harder to reproduce on slower network connections where the fetch completes after a longer delay.

The team already confirmed the `Task` in `viewDidLoad` is started on the main thread. They are confused because they believed `async/await` always resumes on the same thread it was called from.

## Buggy code

```swift
import UIKit

class ArticleDetailViewController: UIViewController {
    var articleID: String = ""
    var bodyLabel: UILabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.addSubview(bodyLabel)

        Task {
            do {
                let text = try await fetchArticleBody(id: articleID)
                bodyLabel.text = text
            } catch {
                bodyLabel.text = "Failed to load."
            }
        }
    }

    func fetchArticleBody(id: String) async throws -> String {
        let url = URL(string: "https://api.example.com/articles/\(id)")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return String(data: data, encoding: .utf8) ?? ""
    }
}
```
