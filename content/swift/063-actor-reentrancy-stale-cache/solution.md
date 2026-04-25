## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Reentrancy Corrupts Cache State
// ------------------------------------------------------------------------

import Foundation

actor UserCache {
    private var profiles: [String: UserProfile] = [:]
    private var inFlight: [String: Task<UserProfile, Error>] = [:]

    func profile(for userID: String) async throws -> UserProfile {
        if let cached = profiles[userID] {
            return cached
        }

        if let task = inFlight[userID] {
            return try await task.value
        }

        // CHANGE 1: Create and register the Task in inFlight BEFORE suspending, so any concurrent caller that arrives while we are awaiting will find the existing Task and join it rather than launching a new one.
        let task = Task {
            try await NetworkClient.shared.fetchUser(id: userID)
        }
        inFlight[userID] = task

        // CHANGE 2: After the suspension point, re-check profiles in case another execution already stored the result, and guard against overwriting a fresher inFlight entry before writing back.
        do {
            let profile = try await task.value
            if profiles[userID] == nil {
                profiles[userID] = profile
            }
            if inFlight[userID]?.isSameTask(as: task) == true {
                inFlight.removeValue(forKey: userID)
            }
            return profile
        } catch {
            if inFlight[userID]?.isSameTask(as: task) == true {
                inFlight.removeValue(forKey: userID)
            }
            throw error
        }
    }
}

// CHANGE 2: Helper extension so we can compare Task identity without storing extra state.
extension Task {
    func isSameTask(as other: Task) -> Bool {
        // Tasks are reference types; pointer equality identifies the same instance.
        return self == other
    }
}
```

## Explanation

### Issue 1: In-flight Task stored after first suspension

**Problem:** Two callers request the same `userID` at nearly the same time. The backend team sees two HTTP requests arrive for the same resource within milliseconds of each other. The `inFlight` guard that should coalesce the second caller onto the first request is not firing.

**Fix:** The `Task` is created and assigned to `inFlight[userID]` synchronously before any `await`. The original code already did this correctly in terms of ordering — the real problem exposed by reentrancy is what happens *after* `task.value` resumes. The `CHANGE 1` comment makes the intent explicit and keeps the registration line immediately adjacent to `Task { }` creation so no future refactor can accidentally insert an `await` between them.

**Explanation:** Swift actors serialize access, but `await` is a suspension point: the actor releases its exclusive lock while waiting for the network call. A second caller can enter `profile(for:)` during that suspension. In the buggy code, the sequence is: Caller A creates the `Task`, stores it in `inFlight`, then `await`s. The actor is now free. Caller B enters, reads `inFlight[userID]`, and — because the registration happened before the suspension — should find the task. So why does the bug appear? The root issue is that Caller B's `return try await task.value` also suspends; when *its* result comes back, it re-enters the actor and calls `inFlight.removeValue` even though Caller A may still be mid-flight or has already removed it. If `inFlight` is empty at the wrong moment (e.g., Caller A's cleanup ran first), a third caller that arrives finds no entry and fires another request. The fix in CHANGE 2 adds an identity check before removing, so only the owning task cleans up.

---

### Issue 2: Post-suspension state not re-validated before writing back

**Problem:** After `await task.value` resumes, the code unconditionally writes `profiles[userID] = profile` and calls `inFlight.removeValue(forKey: userID)`. If a second coalesced request also reaches this point (both callers awaited the same task and both resume), they both write the profile (harmless but wasteful) and the second `removeValue` operates on whatever `inFlight` holds at that moment — potentially a *new* task registered for a fresh request that arrived after the first one completed.

**Fix:** After the suspension point, `profiles[userID]` is only written when it is still `nil` (`if profiles[userID] == nil`). The `inFlight` entry is only removed when `inFlight[userID]` still refers to *this exact task* (`isSameTask(as:)`), checked via pointer equality on the `Task` reference. The same guard is applied in the `catch` branch so a failing request also cleans up safely.

**Explanation:** When two callers both join the same `Task` via `await task.value`, both suspensions resume when the task finishes — one after the other inside the actor. The first resumption stores the profile and removes the in-flight entry. The second resumption then runs: without the guard, it writes the profile again (fine) but also calls `removeValue` on `inFlight`. If a third caller triggered a brand-new task for the same ID between the two resumptions, the second resumption's `removeValue` silently deletes that new entry, making all subsequent callers launch yet more requests. `isSameTask(as:)` uses `Task`'s reference-type identity to ensure only the task that registered itself also deregisters itself.
