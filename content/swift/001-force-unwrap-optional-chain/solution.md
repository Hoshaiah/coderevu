## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Force Unwrap Crashes on Empty Response
// ------------------------------------------------------------------------

struct UserProfile: Decodable {
    let id: Int
    let name: String
    let email: String
}

func fetchUserProfile(userID: Int) async throws -> UserProfile {
    let url = URL(string: "https://api.example.com/users/\(userID)")!
    let (data, response) = try await URLSession.shared.data(from: url)

    // CHANGE 2: Use `as?` + guard instead of force-cast so a non-HTTP response throws cleanly rather than crashing.
    guard let httpResponse = response as? HTTPURLResponse else {
        throw URLError(.badServerResponse)
    }
    guard httpResponse.statusCode == 200 else {
        throw URLError(.badServerResponse)
    }

    // CHANGE 1: Use `try` instead of `try?` so a decoding failure throws a real error instead of producing nil that is then force-unwrapped.
    let profile = try JSONDecoder().decode(UserProfile.self, from: data)
    return profile
}
```

## Explanation

### Issue 1: Force-Unwrap After Silenced Decode Error

**Problem:** When the network drops mid-request, `URLSession` may return an empty or partial `Data` value. `try? JSONDecoder().decode(...)` silences any thrown `DecodingError` and returns `nil`. The subsequent `profile!` then hits `Fatal error: Unexpectedly found nil while unwrapping an Optional value`, crashing the app — which is exactly the crash users on flaky connections report.

**Fix:** Replace `try? JSONDecoder().decode(UserProfile.self, from: data)` and the trailing `profile!` with a single `try JSONDecoder().decode(UserProfile.self, from: data)` assigned directly to the return value, removing the force-unwrap entirely.

**Explanation:** `try?` converts any thrown error into `nil`, discarding the reason for failure. That is useful when you want an optional result and have a safe fallback, but here there is no fallback — the code immediately force-unwraps the optional, so the only effect of `try?` is to swap a descriptive `DecodingError` for a harder-to-diagnose nil crash. Using `try` instead lets the `DecodingError` propagate up to the caller, where it can be logged or shown to the user gracefully. A related pitfall: even if the server always sends valid JSON under normal conditions, zero-byte responses (common when a connection resets) are not valid JSON, so the decoder always throws on them.

---

### Issue 2: Force-Cast of URLResponse to HTTPURLResponse

**Problem:** `response as! HTTPURLResponse` will crash with a `Could not cast value` runtime error if the response object is not an `HTTPURLResponse`. While uncommon with standard HTTPS requests, certain network-layer failures, proxy configurations, or unit-test mock sessions can return a base `URLResponse` instead.

**Fix:** Replace `let httpResponse = response as! HTTPURLResponse` with `guard let httpResponse = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }`, turning the hard crash into a thrown error.

**Explanation:** `as!` performs an unconditional downcast and traps at runtime if the type does not match, giving the caller no chance to handle the situation. `as?` returns an optional, and the `guard` statement converts the `nil` case into a thrown `URLError`, which the caller can catch and handle — for example, by showing a retry prompt. In practice the crash from force-casting is rarer than the decoding crash (issue 1), but it becomes likely during testing with mock `URLSession` implementations that return plain `URLResponse` objects, making this a hidden time bomb that only surfaces outside production.
