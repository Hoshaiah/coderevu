## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — ObservableObject Retain Cycle in Closure
// ------------------------------------------------------------------------

import AVFoundation
import SwiftUI
import Combine

class VideoPlayerViewModel: ObservableObject {
    @Published var currentTime: Double = 0
    let player: AVPlayer
    private var timeObserver: Any?

    init(url: URL) {
        self.player = AVPlayer(url: url)
        setupTimeObserver()
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        // CHANGE 1: Use [weak self] instead of [self] so the closure does not hold a strong reference to the view model, breaking the retain cycle.
        ) { [weak self] time in
            self?.currentTime = time.seconds
        }
    }

    // CHANGE 2: deinit now actually executes because the retain cycle is broken; removeTimeObserver cleans up the player's internal reference to the closure.
    deinit {
        if let observer = timeObserver {
            player.removeTimeObserver(observer)
        }
    }
}

struct VideoPlayerView: View {
    @StateObject var viewModel: VideoPlayerViewModel

    var body: some View {
        VideoPlayer(player: viewModel.player)
            .overlay(alignment: .bottom) {
                Text(String(format: "%.1f", viewModel.currentTime))
            }
    }
}
```

## Explanation

### Issue 1: Strong Self Capture Causes Retain Cycle

**Problem:** After the user dismisses the video player, `VideoPlayerViewModel` is never deallocated. `deinit` does not print, and Memory instruments show the object and the `AVPlayer` still live in the heap, consuming substantial memory.

**Fix:** Replace `[self]` with `[weak self]` in the `addPeriodicTimeObserver` closure (CHANGE 1), and access the property through the optional `self?.currentTime`.

**Explanation:** `AVPlayer` internally retains the closure you pass to `addPeriodicTimeObserver`. With `[self]`, the closure holds a strong reference to `VideoPlayerViewModel`. The view model also holds a strong reference to `player` (the `AVPlayer`). This creates a cycle: view model → player → closure → view model. Neither object's reference count can drop to zero, so neither is freed. Changing the capture to `[weak self]` means the closure holds only a weak reference to the view model. When the SwiftUI view releases its `@StateObject` ownership, nothing else keeps the view model alive, its reference count hits zero, and ARC deallocates it. A related pitfall: if you later store the closure in a local variable elsewhere and accidentally capture `self` strongly there too, the cycle reappears — always audit every closure that outlives the current call stack.

---

### Issue 2: deinit Never Executes, Observer Never Removed

**Problem:** Because the view model is never deallocated (Issue 1), `deinit` never runs, so `player.removeTimeObserver` is never called. The player keeps firing its time callback indefinitely and retains its decode buffers, contributing to the memory growth seen in jetsam logs.

**Fix:** The `deinit` body (CHANGE 2) is correct as written — it calls `player.removeTimeObserver(observer)` — but it only runs once the retain cycle is broken by CHANGE 1. No code change is required inside `deinit` itself; the comment marks that its correct execution now depends on the capture fix.

**Explanation:** `addPeriodicTimeObserver` returns an opaque observer token. The player will keep invoking the closure on every tick until you pass that token to `removeTimeObserver`. If the view model's `deinit` is blocked by a retain cycle, cleanup never happens. Once CHANGE 1 lets the view model reach zero retain count, `deinit` fires, the observer is removed, and the player releases its internal reference to the closure. This also stops the periodic timer from running on the main queue after the view is gone, which could otherwise cause subtle UI update attempts on a deallocated context.
