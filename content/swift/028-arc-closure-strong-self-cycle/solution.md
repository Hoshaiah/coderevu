## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Retain Cycle in Completion Closure
// ------------------------------------------------------------------------

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
        // CHANGE 2: Cancel any in-flight task before starting a new one so stale closures (each capturing self) don't accumulate.
        if let id = taskID { client.cancel(id); taskID = nil }
        // CHANGE 1: Capture self weakly so the closure does not keep ProfileViewController alive after it is popped.
        taskID = client.fetchProfile { [weak self] result in
            guard let self = self else { return }
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

## Explanation

### Issue 1: Strong capture causes retain cycle

**Problem:** After the user navigates away from `ProfileViewController`, Instruments shows the instance is never deallocated. Memory usage grows with each visit to the screen because every `ProfileViewController` ever created stays alive.

**Fix:** Replace the bare `self` capture in the `fetchProfile` closure with `[weak self]`, and add a `guard let self = self else { return }` at the top of the closure body (see `CHANGE 1`).

**Explanation:** `NetworkClient` stores the completion closure until the request finishes or is cancelled. That closure captures `self` — meaning it holds a strong reference to the `ProfileViewController`. So the reference graph is: `NetworkClient` → closure → `ProfileViewController` → `client` (the singleton `NetworkClient`). Because `NetworkClient` is a singleton it is never released, so the closure is never released, so `ProfileViewController` is never released. Using `[weak self]` breaks the strong reference from the closure to the view controller. When the navigation stack pops the controller, its only remaining strong reference is gone and ARC deallocates it. The `guard let self` check then makes the closure a no-op if the controller was already freed, which is the correct behaviour for a stale response arriving after navigation.

---

### Issue 2: Old task not cancelled before starting a new fetch

**Problem:** If the user navigates away and back quickly (before the first request finishes), `viewWillAppear` starts a second `fetchProfile` call while the first is still running. Both closures capture `self`, compounding the retain pressure and potentially causing the label to be updated out of order.

**Fix:** At the top of `viewWillAppear`, before calling `fetchProfile`, cancel the existing task if `taskID` is non-nil and set `taskID` to `nil` (see `CHANGE 2`). The existing `viewDidDisappear` cancellation is kept as a safety net for the normal pop path.

**Explanation:** `viewWillAppear` can fire multiple times for a single controller instance — for example on a push/pop within a navigation stack or when a modal is dismissed on top of it. Without the guard, each appearance starts a new task and overwrites `taskID` with the new `UUID`, losing the handle to the previous task. That previous task continues running and holds its own closure (which holds `self`) until it either completes or is garbage-collected by the client. Cancelling before reassigning ensures at most one in-flight request exists at any time, so at most one closure referencing `self` is outstanding, which keeps behaviour predictable and prevents the compounding memory pressure.
