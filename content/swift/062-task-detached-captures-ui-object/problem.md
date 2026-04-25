---
slug: task-detached-captures-ui-object
track: swift
orderIndex: 62
title: Detached Task Mutates UI Off Main
difficulty: hard
tags:
  - concurrency
  - main-actor
  - thread-safety
language: swift
---

## Context

This code is in `FeedViewController.swift`, a UIKit view controller managing a social feed. When the user pulls to refresh, a detached background task is spawned to fetch new posts from the network. After fetching, the task updates the view controller's data source and reloads the table view. The developer used `Task.detached` to avoid inheriting the caller's actor context, intending to keep network work off the main thread.

The app crashes intermittently with `UITableView` hierarchy inconsistency errors and occasional `EXC_BAD_ACCESS` in UIKit internals. Thread Sanitizer reports a data race on `self.posts`. The crashes are most frequent on devices with more CPU cores and under heavy system load. On the simulator the issue almost never reproduces.

The developer thought that since `Task.detached` runs on a background thread, it was the right tool to avoid blocking the UI — which is partially correct. The problem is with what happens *after* the network work completes.

## Buggy code

```swift
import UIKit

class FeedViewController: UIViewController, UITableViewDataSource {
    private var tableView = UITableView()
    private var posts: [Post] = []
    private let feedService: FeedService

    init(feedService: FeedService) {
        self.feedService = feedService
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError() }

    @objc func handleRefresh() {
        Task.detached {
            do {
                let newPosts = try await self.feedService.fetchLatestPosts()
                // Directly update UI state from background task
                self.posts = newPosts
                self.tableView.reloadData()
            } catch {
                print("Fetch failed: \(error)")
            }
        }
    }

    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        return posts.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "Cell") ?? UITableViewCell()
        cell.textLabel?.text = posts[indexPath.row].title
        return cell
    }

    struct Post { let title: String }
    class FeedService { func fetchLatestPosts() async throws -> [Post] { return [] } }
}
```
