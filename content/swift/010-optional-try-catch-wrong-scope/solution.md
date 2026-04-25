## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — try? Discards Nested Error Silently
// ------------------------------------------------------------------------

struct Credentials: Decodable {
    let token: String
    let expiresAt: Date
}

// CHANGE 2: Function now throws instead of returning optional, so callers receive the actual error and can distinguish failure modes.
func loadCredentials(for key: String) throws -> Credentials {
    // CHANGE 1: Replaced try? with try so KeychainError.itemNotFound (and any other Keychain error) propagates to the caller instead of being silently converted to nil.
    let data = try Keychain.read(key: key)
    // CHANGE 2: Replaced try? with try so a JSON decode failure also propagates rather than returning nil silently.
    return try JSONDecoder().decode(Credentials.self, from: data)
}

// Call site:
// do {
//     let creds = try loadCredentials(for: "authToken")
//     useCredentials(creds)
// } catch {
//     redirectToLogin()
// }
```

## Explanation

### Issue 1: `try?` Silences Keychain Errors

**Problem:** After the keychain migration wiped old entries, `Keychain.read(key:)` throws `KeychainError.itemNotFound`. Because the call is wrapped in `try?`, Swift discards that error and binds `data` to `nil`. The `guard` then returns `nil` from `loadCredentials`, which looks identical to a successful absence-of-credentials — but the call site only redirects to login when `nil` is returned. In this case the keychain migration left a stale, undecodable entry rather than no entry, so `Keychain.read` succeeded and returned bad bytes, meaning `data` was non-nil and execution continued to the decode step.

**Fix:** Replace `try? Keychain.read(key: key)` with `try Keychain.read(key: key)` (CHANGE 1), removing the error-suppression operator so any `KeychainError` propagates up the call stack.

**Explanation:** `try?` is syntactic sugar that catches any thrown error and returns `nil` in its place. That means the distinction between "no item stored" (throws) and "item stored but unreadable" (throws a different error) and "item stored and readable" (returns data) collapses into two states: nil or non-nil. Once that information is gone, the caller has no way to react correctly. Using plain `try` inside a throwing function preserves the full error and lets the coordinator layer decide what to do. A related pitfall: developers sometimes use `try?` in a `guard` thinking "if it fails I'll just return nil", which is fine for truly optional operations but wrong whenever the caller needs to distinguish error types.

---

### Issue 2: Optional Return Hides All Failures from the Coordinator

**Problem:** Even if CHANGE 1 were applied in isolation, the function signature `-> Credentials?` still cannot communicate errors to the caller — a throwing function cannot be called with `try` inside a non-throwing one without wrapping it in `try?` again, recreating the same suppression. The coordinator's `if let` branch treats every non-nil return as valid credentials and every nil as "no credentials", with no path to handle a real error differently.

**Fix:** Change the return type from `Credentials?` to `Credentials` and add `throws` to the function signature (CHANGE 2), then replace both `try?` calls with plain `try` so errors escape the function.

**Explanation:** A `-> T?` signature conflates two distinct outcomes: "successfully determined there are no credentials" and "failed to determine anything". For a banking app these need different responses — missing credentials mean redirect to login, but a keychain I/O error might mean show an alert or retry. Making the function `throws` lets each failure case carry its specific error type to the coordinator. The call site moves from `if let` to a `do/catch` block, where the `catch` clause calls `redirectToLogin()` (or more specific handling) for any error. This also removes the need for the intermediate `guard let data` unwrap, because a thrown error exits before the decode line is reached.
