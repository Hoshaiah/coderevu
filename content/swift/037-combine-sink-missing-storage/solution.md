## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Combine Subscription Immediately Cancelled
// ------------------------------------------------------------------------

import Foundation
import Combine

class NotificationService {
    static let shared = NotificationService()
    let notificationPublisher = PassthroughSubject<String, Never>()
}

final class NotificationBannerViewModel: ObservableObject {
    @Published var currentBanner: String?

    // CHANGE 2: Added a Set<AnyCancellable> property to retain subscriptions for the lifetime of this view model.
    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationService.shared.notificationPublisher
            .sink { [weak self] message in
                self?.currentBanner = message
            }
            // CHANGE 1: Store the AnyCancellable in cancellables using .store(in:) so the subscription is not immediately deallocated.
            .store(in: &cancellables)
    }

    func dismiss() {
        currentBanner = nil
    }
}
```

## Explanation

### Issue 1: Subscription Discarded Immediately

**Problem:** The banner never appears when a notification fires. The `sink` closure is never called because the subscription is torn down the moment `init` returns — before any events have a chance to arrive.

**Fix:** Call `.store(in: &cancellables)` on the `AnyCancellable` returned by `.sink`, chaining it directly after the `sink` call in `init`.

**Explanation:** In Combine, `.sink` returns an `AnyCancellable` token. The token's `deinit` cancels the underlying subscription. When the return value is not assigned anywhere, Swift immediately releases it at the end of the statement, which triggers `deinit` and cancels the subscription right away. `.store(in:)` moves ownership of the token into the `cancellables` set, so the subscription stays alive as long as the set does. A related pitfall: assigning to a local `var` inside `init` has the same problem — the local is released when `init` exits.

---

### Issue 2: No Cancellables Storage Property

**Problem:** Even with `.store(in:)` called, there is nowhere to store the token because the class has no `Set<AnyCancellable>` property, so the fix for Issue 1 cannot compile.

**Fix:** Add `private var cancellables = Set<AnyCancellable>()` as a stored property on `NotificationBannerViewModel`.

**Explanation:** `Set<AnyCancellable>` is the idiomatic Combine pattern for holding multiple subscriptions. The set is a value type stored on the instance, so it lives as long as the view model instance does. When the view model is deallocated, the set deallocates, `AnyCancellable.deinit` fires for each entry, and all subscriptions are cleanly cancelled — no manual cleanup needed. If you only have one subscription you could alternatively use `private var cancellable: AnyCancellable?`, but the `Set` pattern scales to multiple subscriptions without any changes.
