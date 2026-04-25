## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Silent Zero Balance on Nil
// ------------------------------------------------------------------------

struct AccountResponse: Decodable {
    let accountId: String
    let balance: Double?
    let currency: String
}

class AccountViewModel: ObservableObject {
    @Published var displayBalance: String = "--"
    @Published var isLoading: Bool = false
    // CHANGE 2: Added a separate published property so the UI can distinguish a nil-balance from a fetch error, rather than conflating both into displayBalance.
    @Published var balanceUnavailable: Bool = false

    func load(accountId: String) async {
        isLoading = true
        // CHANGE 2: Reset the unavailable flag on each load attempt so stale state doesn't persist across refreshes.
        balanceUnavailable = false
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchAccount(id: accountId)
            // CHANGE 1: Guard against a nil balance explicitly instead of coalescing to 0.0, which hides the server sending null and renders a false '$0.00'.
            guard let amount = response.balance else {
                balanceUnavailable = true
                displayBalance = "--"
                return
            }
            displayBalance = String(format: "$%.2f", amount)
        } catch {
            displayBalance = "Error"
        }
    }
}
```

## Explanation

### Issue 1: Nil Balance Coerced to Zero

**Problem:** When the server returns `"balance": null` in an otherwise valid JSON payload, the app decodes `balance` as `nil` and then the `?? 0.0` fallback quietly substitutes zero. The user sees `$0.00` even though their account has funds, and there is no visual cue that the value is absent rather than genuinely zero.

**Fix:** Replace `response.balance ?? 0.0` with a `guard let amount = response.balance` at the CHANGE 1 site. When `balance` is `nil`, set `balanceUnavailable = true`, assign `"--"` to `displayBalance`, and return early without formatting a number.

**Explanation:** `Double?` correctly models the possibility that the server omits or nulls the field. The `??` operator is meant for providing a sensible default when a value is truly optional by design — here, zero is not a sensible default because it is a valid and meaningful account balance. Substituting zero conflates two distinct states: "balance is zero" and "balance is unknown". The `guard` makes the nil case an explicit branch, so the rest of the function only runs when a real numeric value is present. A related pitfall: if you later add business logic that triggers alerts for zero-balance accounts, the silent coercion would generate false positives for every delayed DB read.

---

### Issue 2: No Distinguishable State for Missing vs. Error

**Problem:** After the original fix to stop coalescing nil, both a network/decoding error and a null-balance response would collapse into the same `displayBalance` string, giving the UI no way to show a loading spinner, a retry prompt, or a "balance temporarily unavailable" message selectively.

**Fix:** Add a `@Published var balanceUnavailable: Bool = false` property at the CHANGE 2 site. Set it to `true` in the nil-balance branch and reset it to `false` at the start of each `load` call. The SwiftUI view can observe this flag independently of `displayBalance` and render the appropriate indicator.

**Explanation:** Encoding all possible states into a single `String` property forces the view to parse its own display value to decide what UI to show, which is fragile and couples presentation logic to state logic. A dedicated boolean flag keeps each concern in one place: `displayBalance` holds a formatted value when one exists, and `balanceUnavailable` signals when the value is structurally absent. Resetting the flag at the top of `load` prevents a previous null response from being treated as unavailable on a subsequent successful fetch, which would otherwise require the user to restart the app to clear it.
