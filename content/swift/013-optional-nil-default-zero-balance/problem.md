---
slug: optional-nil-default-zero-balance
track: swift
orderIndex: 13
title: Silent Zero Balance on Nil
difficulty: easy
tags:
  - optionals
  - correctness
  - finance
language: swift
---

## Context

This code lives in `AccountViewModel.swift`, a view model that fetches a user's account balance from a remote API and displays it in a SwiftUI dashboard. The JSON response is decoded into a `Decodable` struct and the balance is presented through a computed property.

Users occasionally report seeing a balance of $0.00 in the app even though their account has funds. The issue disappears on the next pull-to-refresh. Support logs show that the API sometimes returns a valid JSON payload where the `balance` key is present but the server sends `null` (e.g., during a delayed DB read). The app should display a loading indicator or an error, not $0.00, in that case.

The team confirmed the network call succeeds (HTTP 200) and decoding doesn't throw. They traced the rendered value to the computed property below, then closed the investigation assuming it was a backend race condition they couldn't control.

## Buggy code

```swift
struct AccountResponse: Decodable {
    let accountId: String
    let balance: Double?
    let currency: String
}

class AccountViewModel: ObservableObject {
    @Published var displayBalance: String = "--"
    @Published var isLoading: Bool = false

    func load(accountId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await APIClient.shared.fetchAccount(id: accountId)
            let amount = response.balance ?? 0.0
            displayBalance = String(format: "$%.2f", amount)
        } catch {
            displayBalance = "Error"
        }
    }
}
```
