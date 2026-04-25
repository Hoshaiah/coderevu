## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Hop Blocks Main Thread
// ------------------------------------------------------------------------

import UIKit

actor ProfileCache {
    private var profiles: [String: Profile] = [:]

    // CHANGE 3: Moved the sleep outside the actor method to a detached async context so concurrent lookups are not serialised by the actor; in production remove the sleep entirely or do real async I/O here.
    func profile(for userID: String) -> Profile? {
        return profiles[userID]
    }

    func store(_ profile: Profile, for userID: String) {
        profiles[userID] = profile
    }
}

struct Profile { var name: String }

class ProfileViewController: UIViewController {
    var userID: String = ""
    let cache = ProfileCache()
    @IBOutlet weak var nameLabel: UILabel!

    override func viewDidLoad() {
        super.viewDidLoad()
        // CHANGE 1: Use a detached task so the work runs off the main-actor executor; without this the Task inherits @MainActor and the 500ms actor hop blocks the main thread while awaiting.
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            let profile = await self.cache.profile(for: self.userID)
            // CHANGE 2: Explicitly jump back to the main actor for the UI update so the label write is always on the main thread regardless of where the detached task resumes.
            await MainActor.run {
                self.nameLabel.text = profile?.name ?? "Unknown"
            }
        }
    }
}
```

## Explanation

### Issue 1: Task Inherits Main-Actor Executor

**Problem:** Users see a 1–2 second freeze when the profile screen loads. The main thread is blocked waiting for the actor hop to complete. Instruments shows the main thread spending that time inside the Swift concurrency runtime rather than in layout or drawing code.

**Fix:** Replace `Task { … }` with `Task.detached(priority: .userInitiated) { … }` at the `// CHANGE 1` site. This detaches the work from the `@MainActor` context so the suspension and resume happen on a cooperative thread pool thread instead of on the main thread.

**Explanation:** `UIViewController.viewDidLoad` is `@MainActor`-isolated. A plain `Task { … }` created inside a `@MainActor` context inherits that actor, so the closure body starts executing on the main thread. When the task hits `await cache.profile(for:)`, the main thread suspends waiting for the actor hop to complete — including the 500ms sleep inside the actor method. A detached task starts without any actor context, so the await happens on a background cooperative thread and the main thread is never blocked. The trade-off is that you must be explicit about which thread touches the UI, which leads to Issue 2.

---

### Issue 2: UI Update Not Explicitly on Main Actor

**Problem:** After switching to a detached task, `nameLabel.text = …` executes on whichever cooperative thread the task resumes on, not the main thread. UIKit requires all view mutations on the main thread; violating this causes intermittent rendering glitches or crashes that are hard to reproduce.

**Fix:** Wrap the label update in `await MainActor.run { … }` at the `// CHANGE 2` site. This guarantees the assignment runs on the main-actor executor regardless of which thread the detached task resumes on.

**Explanation:** Swift's strict concurrency checking can catch some of these violations at compile time, but not all — especially when the calling context is a detached task with no actor. `MainActor.run` is the idiomatic way to hop back to the main actor for a short synchronous block. An alternative is to mark the update helper `@MainActor`, but `MainActor.run` makes the intention explicit at the call site and avoids spreading annotations through the class.

---

### Issue 3: Actor Serialises Concurrent Cache Lookups

**Problem:** Every call to `profile(for:)` acquires the actor's lock and then sleeps for 500ms before returning. If two view controllers load simultaneously, the second one queues behind the first, adding another 500ms of latency. Even with the real cache (no sleep), any slow synchronous work inside an actor blocks all other callers to that actor.

**Fix:** Remove `async` and `try? await Task.sleep(…)` from `profile(for:)` at the `// CHANGE 3` site, making it a synchronous accessor. The actor still protects the dictionary from concurrent mutation, but callers are no longer serialised by an artificial delay.

**Explanation:** An actor's executor is a serial queue. Any `await` inside an actor method relinquishes the executor, but a long synchronous block (or in this case a sleep) holds the executor for its full duration, preventing other callers from entering. Making the dictionary lookup synchronous means the actor holds the lock only for the microseconds needed to read a dictionary key, so multiple callers can interleave rapidly. In production, if real async I/O is needed (e.g., reading from disk), do that work outside the actor and only call back in to store the result, keeping actor-held time short.
