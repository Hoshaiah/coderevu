## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Combine assign(to:on:) Retain Cycle
// ------------------------------------------------------------------------

import Combine
import Foundation

final class SearchViewModel {
    @Published var query: String = ""
    @Published var results: [String] = []

    private var cancellables = Set<AnyCancellable>()

    init() {
        $query
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .flatMap { [weak self] text -> AnyPublisher<[String], Never> in
                guard let self else {
                    return Just([]).eraseToAnyPublisher()
                }
                return self.search(text: text)
            }
            // CHANGE 1: Replace assign(to:on:) with sink using [weak self] to avoid the strong capture of self that assign(to:on:) performs internally; this breaks the retain cycle so SearchViewModel can be deallocated normally.
            // CHANGE 2: Using sink+store instead of assign(to:on:)+store means the cancellable no longer forms a self->cancellables->subscription->self ownership loop; the weak capture lets ARC collect self when the view controller releases it.
            .sink { [weak self] newResults in
                self?.results = newResults
            }
            .store(in: &cancellables)
    }

    private func search(text: String) -> AnyPublisher<[String], Never> {
        // Simulated async search
        Just(text.isEmpty ? [] : ["Result for \(text)"])
            .eraseToAnyPublisher()
    }
}
```

## Explanation

### Issue 1: assign(to:on:) Strong Self Capture

**Problem:** After the user pops the search screen, `SearchViewModel` is never released. Instruments' Leaks template shows the instance is still alive, and repeating the navigation cycle grows memory steadily.

**Fix:** Replace `.assign(to: \.results, on: self)` with `.sink { [weak self] newResults in self?.results = newResults }` at the CHANGE 1 site. The `[weak self]` capture list lets ARC release `self` when the owning view controller drops its reference.

**Explanation:** `assign(to:on:)` is a convenience overload that internally holds a strong reference to the object you pass as `on:`. When `self` is the target, the publisher chain holds a strong pointer to `SearchViewModel`. The `AnyCancellable` produced by `assign` is then stored in `cancellables`, which is itself a property of `self`. That completes the cycle: `self` owns `cancellables`, `cancellables` owns the subscription, and the subscription strongly owns `self`. Nothing in that triangle has a reason to drop its count to zero. Switching to `sink` with `[weak self]` makes the subscription's only reference to `self` a weak one, so when the view controller releases the view model, its retain count drops to zero and ARC deallocates it.

---

### Issue 2: Cancellable Storage Compounds the Retain Cycle

**Problem:** Even if a developer notices the strong capture, storing the `AnyCancellable` from `assign(to:on:)` in `self.cancellables` makes the ownership graph circular in two directions, so fixing only one side still leaves a leak.

**Fix:** At the CHANGE 2 site, the same `sink`+`store` pattern replaces `assign`+`store`. Because the closure inside `sink` captures `self` weakly, the stored cancellable no longer holds a strong path back to `self`, and the cycle is fully broken.

**Explanation:** `self.cancellables` is a `Set<AnyCancellable>` that keeps each subscription alive for the lifetime of `self`. When the subscription itself also holds a strong reference to `self` (as `assign(to:on:)` does), you get a bidirectional strong graph: `self → cancellables → subscription → self`. Breaking just one strong edge is enough to let ARC do its job. The `sink { [weak self] in ... }` closure makes the subscription's reference to `self` weak, so the graph becomes `self → cancellables → subscription ⇢ self` (⇢ meaning weak). When the external owner (the view controller) drops `self`, the retain count hits zero, `self` deallocates, `cancellables` deinits, the subscription cancels, and the weak reference is zeroed automatically. A related pitfall: `assign(to:)` (the `@Published` overload introduced in iOS 14) does not have this problem because it ties the subscription lifetime to the publisher itself rather than storing a cancellable, so it is safe to use when assigning back to a `@Published` property on the same object.
