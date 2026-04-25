## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Delegate Strong Reference Retain Cycle
// ------------------------------------------------------------------------

protocol NetworkManagerDelegate: AnyObject {
    func didFinishDownload(data: Data)
    func didFailWithError(_ error: Error)
}

class NetworkManager {
    static let shared = NetworkManager()

    // CHANGE 1: Declare delegate as `weak` so the singleton does not retain the view controller; AnyObject constraint on the protocol makes this legal.
    weak var delegate: NetworkManagerDelegate?

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

    // CHANGE 2: Clear the delegate in deinit (or viewDidDisappear) so the singleton does not hold a stale reference once this controller is gone.
    deinit {
        if NetworkManager.shared.delegate === self {
            NetworkManager.shared.delegate = nil
        }
    }

    func didFinishDownload(data: Data) {
        // update UI
    }

    func didFailWithError(_ error: Error) {
        // show alert
    }
}
```

## Explanation

### Issue 1: Strong delegate reference on singleton

**Problem:** Every time `HomeViewController` is pushed onto the navigation stack it assigns itself to `NetworkManager.shared.delegate`. Because the singleton lives for the app's entire lifetime and `delegate` is a strong `var`, the singleton keeps the view controller alive indefinitely. Instruments shows each pop of the home screen leaves a leaked `HomeViewController` instance that never reaches `deinit`.

**Fix:** Change `var delegate: NetworkManagerDelegate?` to `weak var delegate: NetworkManagerDelegate?` in `NetworkManager`. The `weak` keyword is permitted here because the protocol already inherits from `AnyObject`, constraining conformers to reference types.

**Explanation:** A strong reference means the object that holds it is counted as an owner. `NetworkManager.shared` is a singleton that never deallocates, so anything it owns strongly also never deallocates. `HomeViewController` holds a reference to the singleton (through `NetworkManager.shared`), and the singleton holds a strong reference back — that is a reference cycle. Marking the property `weak` means the singleton borrows a reference without claiming ownership, so the view controller's reference count can drop to zero when the navigation stack pops it, allowing `deinit` to run. A related pitfall: `weak` is only valid on reference types, which is why the `AnyObject` constraint on the protocol matters — without it the compiler rejects `weak var delegate`.

---

### Issue 2: Stale delegate reference after dismissal

**Problem:** Even with a `weak` delegate, if another object (e.g., a second view controller) later sets itself as the delegate, and then `HomeViewController` is still in memory for any reason, the delegate slot is already taken. More practically, without explicit cleanup the `weak` property becomes `nil` silently, which is correct — but only if nothing reassigns the delegate in between. In a more complex flow where the singleton is reused before the old controller fully deallocates, the old delegate can receive callbacks it is not equipped to handle.

**Fix:** Add a `deinit` to `HomeViewController` that sets `NetworkManager.shared.delegate = nil` when `self` is the current delegate, using an identity check (`===`) to avoid clearing a delegate set by a different controller.

**Explanation:** `weak` alone makes the memory safe — the runtime zeroes the pointer when the referent deallocates. But in a singleton-backed delegate pattern, it is good practice to actively clear the delegate slot when the owner goes away rather than relying on the runtime's zeroing. This prevents a window where a partially-deallocating controller is still the registered delegate and an in-flight network callback fires `didFinishDownload` or `didFailWithError` against a controller whose view hierarchy is already torn down. The identity check `=== self` ensures the `deinit` does not accidentally clear a delegate that a newer controller installed after this one was popped.
