## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Weak Self Capture Nil Dereference
// ------------------------------------------------------------------------

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
                // CHANGE 1: Guard-unwrap `self` so the closure exits safely when the view controller has been deallocated instead of force-unwrapping and crashing.
                // CHANGE 2: Binding `self` with `guard let self` ensures all subsequent outlet and method accesses use a guaranteed non-nil strong reference for the duration of this block.
                guard let self = self else { return }
                switch result {
                case .success(let profile):
                    self.nameLabel.text = profile.name
                    self.bioLabel.text = profile.bio
                case .failure(let error):
                    self.showError(error)
                }
            }
        }
    }

    private func showError(_ error: Error) {
        // show alert
    }
}
```

## Explanation

### Issue 1: Force-unwrap on weakly captured `self`

**Problem:** The completion closure captures `self` weakly with `[weak self]`, meaning `self` becomes `nil` if the user navigates away before the network response arrives. Every use of `self!` then force-unwraps a `nil` Optional, triggering `EXC_BAD_ACCESS` or a fatal "unexpectedly found nil" error at runtime.

**Fix:** Replace every `self!` force-unwrap with a single `guard let self = self else { return }` at the top of the `DispatchQueue.main.async` block. The rest of the block then uses plain `self.` on the now-strongly-held reference.

**Explanation:** `[weak self]` makes the captured `self` an `Optional<ProfileViewController>`. As long as no other object holds a strong reference to the view controller, ARC will deallocate it and set the weak reference to `nil`. The original code assumed `self` would always be alive by the time the closure ran, which is true on fast connections but false when the user pops the screen during a slow request. The `guard let` pattern re-promotes the weak Optional to a temporary strong reference for the scope of the block; if `self` is already `nil`, the `return` statement exits the closure harmlessly and no UI code runs. A related pitfall: even wrapping individual accesses in `self?.outlet` would be safer than `self!`, but it silently skips updates in ways that can be hard to debug; the `guard` approach makes the early-exit intent explicit.

---

### Issue 2: Outlet access on deallocated controller

**Problem:** When `self` is `nil` and the force-unwrap is removed without a nil guard, any access to `self?.nameLabel` would silently do nothing — but the outlets themselves are `@IBOutlet weak var`, so even a partially-alive controller with released outlets could yield nil label references. The guard ensures the entire UI-update block is skipped when the controller is gone, preventing both the crash and any partial state corruption.

**Fix:** The `guard let self = self else { return }` added at CHANGE 2 wraps the entire `switch` block, so `nameLabel`, `bioLabel`, and `showError` are only accessed when `self` is confirmed non-nil and fully alive.

**Explanation:** `@IBOutlet weak var` outlets are themselves weak references that become `nil` when the view is unloaded or the controller is deallocated. If code reaches `self.nameLabel.text = profile.name` after deallocation, `nameLabel` would be `nil` and the force-implicit-unwrap on the `UILabel!` type would crash. By guarding on `self` first and returning early, the closure never touches the outlets at all when the controller is gone. This also prevents subtle bugs where the controller is alive but its view has been unloaded — a less common scenario in modern UIKit, but still possible when memory pressure triggers `viewDidUnload`-equivalent behavior.
