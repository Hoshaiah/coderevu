## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Strong Delegate Creates Retain Cycle
// ------------------------------------------------------------------------

protocol DownloadManagerDelegate: AnyObject {
    func downloadDidFinish(url: URL)
    func downloadDidFail(error: Error)
}

class DownloadManager {
    // CHANGE 1: declare delegate as `weak` so DownloadManager does not retain its owner, breaking the retain cycle between DownloadManager and DocumentViewController
    weak var delegate: DownloadManagerDelegate?

    func start(url: URL) {
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let self else { return }
            if let error {
                self.delegate?.downloadDidFail(error: error)
            } else {
                self.delegate?.downloadDidFinish(url: url)
            }
        }.resume()
    }
}

class DocumentViewController: UIViewController, DownloadManagerDelegate {
    var downloadManager: DownloadManager?

    override func viewDidLoad() {
        super.viewDidLoad()
        downloadManager = DownloadManager()
        downloadManager?.delegate = self
    }

    func downloadDidFinish(url: URL) { /* update UI */ }
    func downloadDidFail(error: Error) { /* show alert */ }
}
```

## Explanation

### Issue 1: Strong delegate causes retain cycle

**Problem:** After a user navigates away from `DocumentViewController`, neither it nor its `DownloadManager` is ever deallocated. Instruments' Leaks template shows both objects persisting indefinitely. Each navigation creates another leaked pair, and resident memory grows until the OS terminates the app.

**Fix:** Change `var delegate: DownloadManagerDelegate?` to `weak var delegate: DownloadManagerDelegate?` in `DownloadManager`. This is the only token change needed.

**Explanation:** `DocumentViewController` owns `DownloadManager` through its `downloadManager` property (strong reference). In the buggy code, `DownloadManager` also owns `DocumentViewController` back through its `delegate` property (another strong reference). ARC only deallocates an object when its retain count reaches zero, but each object keeps the other's count at one or above, so neither can ever be freed. Marking `delegate` as `weak` tells ARC not to increment the delegate's retain count, so when the navigation stack releases `DocumentViewController`, its count drops to zero, it deallocates, which releases its `downloadManager`, whose count then also drops to zero and it deallocates too. The `weak` keyword is safe here because `DownloadManagerDelegate` is constrained to `AnyObject`, which is required for weak references in Swift — value types (structs, enums) cannot be weakly referenced. One related pitfall: if a callback fires on `URLSession`'s background queue just after the view controller is dismissed, `self.delegate` will already be `nil` and the optional-chaining call (`self.delegate?.downloadDidFail`) is a safe no-op, which is exactly the correct behavior.

---

### Issue 2: Leaked instances accumulate across navigations

**Problem:** Because the retain cycle prevents deallocation, every time the user opens a document view a new `DocumentViewController`+`DownloadManager` pair is created and added to the leaked set. Memory grows proportionally to the number of navigations, eventually triggering a jetsam event (OS kill for exceeding memory limit).

**Fix:** The same `weak` change at `CHANGE 1` resolves this issue: once the cycle is broken, each dismissed `DocumentViewController` and its `DownloadManager` are freed immediately after dismissal, keeping the live instance count at one.

**Explanation:** Each UIKit push/pop navigation or modal presentation creates a fresh `DocumentViewController`. Without the fix, each fresh instance is never freed, so the process's heap grows by the size of both objects on every navigation. With `weak delegate`, the reference graph becomes a directed acyclic graph: `DocumentViewController` → `DownloadManager` (strong), `DownloadManager` ⇢ `DocumentViewController` (weak). When the navigation stack pops `DocumentViewController`, the only remaining strong reference to it is gone and ARC frees it immediately, regardless of how many times the user navigated.
