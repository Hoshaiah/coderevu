## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — UI Update Off Main Thread Async
// ------------------------------------------------------------------------

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
                // CHANGE 1: Dispatch label update to the main actor so UILabel.text is always set on the main thread.
                await MainActor.run { bodyLabel.text = text }
            } catch {
                // CHANGE 2: Same fix for the error path — bodyLabel.text in catch also runs off the main thread without this.
                await MainActor.run { bodyLabel.text = "Failed to load." }
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

## Explanation

### Issue 1: UI updated on URLSession's background thread

**Problem:** Users see purple runtime warnings in Xcode saying `UILabel.text must be used from main thread only`. In production, the label occasionally displays blank text or the app crashes intermittently, with the problem worsening on slower connections.

**Fix:** Wrap the `bodyLabel.text = text` assignment in `await MainActor.run { ... }` immediately after the `await fetchArticleBody` call returns, ensuring the assignment always executes on the main thread.

**Explanation:** When `URLSession.shared.data(from:)` completes, Swift's concurrency runtime resumes the continuation on a thread from the cooperative thread pool — not necessarily the thread that called `await`. The `Task` in `viewDidLoad` inherits the main actor's executor when it is created, but `URLSession.data(from:)` suspends and later resumes on a background thread without automatically hopping back. So after the `await` inside `fetchArticleBody`, execution can be on any thread. `UILabel.text` is a UIKit property that must be accessed only from the main thread; writing it from a background thread is undefined behavior that produces intermittent crashes and visual glitches rather than a consistent failure. Wrapping the assignment in `MainActor.run` forces a hop to the main actor before touching the label, which is the correct, deterministic fix. An alternative is to annotate the whole `viewDidLoad` closure or the function with `@MainActor`, but `MainActor.run` makes the threading intent explicit at the exact mutation site.

---

### Issue 2: Error-path label update shares the same threading bug

**Problem:** When the network request fails and the `catch` block executes `bodyLabel.text = "Failed to load."`, this assignment has exactly the same threading problem as the success path — it runs on whichever thread the cooperative pool used to resume after the failed `URLSession` call.

**Fix:** Wrap `bodyLabel.text = "Failed to load."` in `await MainActor.run { ... }` inside the `catch` block, mirroring the fix applied to the success path.

**Explanation:** The `catch` block runs inline after the `try await` expression throws, so it executes on the same background thread that was resumed after the URLSession error. The runtime does not automatically switch back to the main thread for error handling any more than it does for normal return values. Because this code path is only triggered during network failures — which are less frequent in testing — the bug is easy to miss in reviews. Both the success and error code paths touch UIKit, so both need to be pinned to the main actor. Omitting the fix from `catch` while fixing the `try` path leaves a latent crash that surfaces only when errors occur under load or on poor network connections.
