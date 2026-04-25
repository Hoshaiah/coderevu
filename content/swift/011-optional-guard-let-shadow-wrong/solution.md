## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Shadowed Optional Loses Original Value
// ------------------------------------------------------------------------

struct UserProfile {
    let name: String
    let avatarURL: URL?
}

class ProfileViewModel {
    var cachedProfile: UserProfile?
}

class ProfileViewController: UIViewController {
    let viewModel = ProfileViewModel()
    var nameLabel: UILabel = UILabel()

    func loadProfile() {
        // CHANGE 2: Removed the dead `let cachedProfile = viewModel.cachedProfile` line; it shadowed the name before the guard and was never actually read, causing confusion about which binding `displayProfile` would use.
        // CHANGE 1: Bind directly from `viewModel.cachedProfile` inside the guard so the unwrapped value is the one passed to `displayProfile`; the old code re-fetched the optional a second time, accidentally re-shadowing the outer unused variable and making the flow hard to follow.
        guard let cachedProfile = viewModel.cachedProfile else {
            fetchFromNetwork()
            return
        }
        // Intended to use the unwrapped cached profile
        displayProfile(cachedProfile)
    }

    func displayProfile(_ profile: UserProfile) {
        nameLabel.text = profile.name
    }

    func fetchFromNetwork() {
        // network fetch omitted
        nameLabel.text = "Unknown"
    }
}
```

## Explanation

### Issue 1: Guard Re-Reads Optional Instead of Using Bound Value

**Problem:** The `guard let cachedProfile = viewModel.cachedProfile` line creates a new binding named `cachedProfile`, but there is already a `let cachedProfile` declared on the line above. Swift resolves the name `cachedProfile` inside `displayProfile(cachedProfile)` to the `guard`-bound, unwrapped value — so the display call is actually correct. However, the presence of two variables with the same name in the same scope creates a subtle shadow that makes the code error-prone: any reader or future editor could move or remove the `guard` line and accidentally use the outer, still-optional copy.

**Fix:** Remove the outer `let cachedProfile = viewModel.cachedProfile` declaration entirely (CHANGE 2) so that `guard let cachedProfile = viewModel.cachedProfile` is the only place the name is introduced (CHANGE 1). `displayProfile(cachedProfile)` then unambiguously refers to the `guard`-unwrapped, non-optional value.

**Explanation:** Swift allows a `guard let x = expr` to shadow an outer `let x` in the same scope. When that happens, the name `x` after the `guard` refers to the unwrapped binding, not the outer optional — which is actually what you want. But the outer binding still exists and is never used, which is the source of the reported confusion. If a developer glances at the code and sees `let cachedProfile = viewModel.cachedProfile` followed by `displayProfile(cachedProfile)`, they might believe the optional (not the unwrapped value) is being passed, and incorrectly "fix" it. The minimal, correct change is to delete the outer declaration so one binding exists and its type is unambiguously `UserProfile`, not `UserProfile?`.

---

### Issue 2: Dead Variable Misleads Future Editors

**Problem:** `let cachedProfile = viewModel.cachedProfile` on the line before the `guard` is never read. The compiler accepts it because the `guard` re-shadows the name, but the outer `cachedProfile` constant has type `UserProfile?` and participates in nothing. Any editor who adds a log statement like `print(cachedProfile)` before the `guard` will see the optional, not the profile, and may wrongly conclude the data is missing.

**Fix:** Delete the line `let cachedProfile = viewModel.cachedProfile` entirely (CHANGE 2). The `guard` statement that follows is sufficient to both unwrap and name the value.

**Explanation:** A `let` binding that is immediately shadowed by a `guard let` of the same name produces a Swift compiler warning ("immutable value 'cachedProfile' was never used") in most project configurations. That warning is the first signal that something is wrong. The root of the issue is that the original author likely intended to write the single-`guard` pattern but accidentally left a draft line in place. Removing it makes the scope unambiguous: after the `guard`, `cachedProfile` exists, is non-optional, and goes directly into `displayProfile`. A related pitfall: if `viewModel.cachedProfile` were a computed property with side effects, calling it twice (once for the outer `let`, once for the `guard`) could cause those side effects to fire twice — another reason to read it exactly once inside the `guard`.
