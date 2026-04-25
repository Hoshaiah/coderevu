## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Weak Delegate Nil on Callback
// ------------------------------------------------------------------------

protocol ImageDownloaderDelegate: AnyObject {
    func imageDownloader(_ downloader: ImageDownloader,
                         didFinish image: UIImage)
}

final class ImageDownloader {
    weak var delegate: ImageDownloaderDelegate?
    private let url: URL

    init(url: URL) {
        self.url = url
    }

    func start() {
        // CHANGE 2: capture delegate strongly at call time so it is not lost if the downloader is later released before the callback fires.
        let capturedDelegate = delegate
        URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
            guard let self, error == nil,
                  let data,
                  let image = UIImage(data: data) else { return }
            DispatchQueue.main.async {
                // CHANGE 2: use capturedDelegate instead of self.delegate so the callback always reaches the original delegate regardless of the downloader's lifetime.
                capturedDelegate?.imageDownloader(self, didFinish: image)
            }
        }.resume()
    }
}

// Call site in ProfileViewController
// CHANGE 1: store the downloader in an instance property so ARC keeps it alive until the download completes, preventing premature deallocation.
private var avatarDownloader: ImageDownloader?

func loadAvatar() {
    let downloader = ImageDownloader(url: avatarURL)
    downloader.delegate = self
    downloader.start()
    // CHANGE 1: assign to the instance property instead of letting downloader fall off the stack.
    avatarDownloader = downloader
}
```

## Explanation

### Issue 1: Downloader Deallocates Before Callback

**Problem:** The profile image never appears after scrolling away quickly. The download completes successfully in the network layer, but the completion handler has nowhere to deliver the result because the object that owns the delegate reference is already gone.

**Fix:** Declare `private var avatarDownloader: ImageDownloader?` as an instance property on `ProfileViewController`, and assign the local `downloader` to it at the end of `loadAvatar()` instead of letting it go out of scope.

**Explanation:** Swift uses ARC (Automatic Reference Counting). When `loadAvatar()` returns, the local constant `downloader` is the only strong reference to the `ImageDownloader` instance. ARC immediately decrements the retain count to zero and deallocates the object. The `URLSession` data task continues on a background thread — it holds no reference to the downloader — and when it finishes, `self` inside the closure is `nil` because `[weak self]` was used. The delegate callback is silently skipped. Storing the downloader in an instance property gives it a strong owner for the duration of the request. You can nil out `avatarDownloader` inside the callback once it is no longer needed to release the memory.

---

### Issue 2: Weak Delegate Read After Downloader Release

**Problem:** Even if the downloader somehow survived (e.g., through an indirect retain), reading `self.delegate` inside the async closure can return `nil` if the view controller has been dismissed between the network response arriving and `DispatchQueue.main.async` executing. The app logs nothing because the optional chain just silently no-ops.

**Fix:** Capture the delegate with a strong local reference `let capturedDelegate = delegate` at the start of `start()`, before the data task is created, and use `capturedDelegate` inside the dispatch block instead of `self.delegate`.

**Explanation:** `delegate` is declared `weak`, so it is zeroed out by ARC the moment the delegate object's retain count drops to zero. There is a time window between when the background thread receives data and when the main-thread block actually runs — during heavy scrolling this can be tens of milliseconds, which is long enough for a view controller pop to finish and the delegate to be released. Taking a strong capture of the delegate value at the moment `start()` is called preserves the reference for the lifetime of the closure. The trade-off is that if the view controller is dismissed the caller must decide whether to cancel the download; that is a product decision, but at minimum the callback will fire predictably. A related pitfall: if you later add cancellation logic and nil out `delegate` explicitly to stop callbacks, this captured-strong approach will bypass that — so cancellation should be handled by cancelling the `URLSessionDataTask` directly instead.
