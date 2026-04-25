## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Actor Reentrancy Loses Balance Update
// ------------------------------------------------------------------------

actor WalletActor {
    private var balance: Int

    init(initialBalance: Int) {
        self.balance = initialBalance
    }

    func deductCost(_ cost: Int) async throws {
        // CHANGE 1: Re-check balance before suspending and reserve it immediately by deducting optimistically, preventing concurrent calls from seeing the same balance across the suspension point.
        guard balance >= cost else {
            throw WalletError.insufficientFunds
        }
        // CHANGE 1: Deduct balance before suspension so no other concurrent call can spend the same funds while this call is awaiting the server.
        balance -= cost

        do {
            // Simulate async work: verify purchase with server
            try await verifyWithServer(cost: cost)
        } catch {
            // CHANGE 2: If the server call fails, restore the reserved balance so the actor's state stays consistent with the failed transaction.
            balance += cost
            throw error
        }
    }

    private func verifyWithServer(cost: Int) async throws {
        // Network call — suspends the actor
        try await Task.sleep(nanoseconds: 100_000_000)
    }
}

enum WalletError: Error {
    case insufficientFunds
}
```

## Explanation

### Issue 1: Actor Reentrancy Bypasses Balance Guard

**Problem:** Two concurrent calls to `deductCost` with a cost of, say, 80 on a balance of 100 both read `balance = 100` before either suspends, both pass the `guard balance >= cost` check, and both eventually execute `balance -= cost`, leaving the balance at -60. The actor serializes synchronous access, but the `await` in `try await verifyWithServer` is a suspension point where the actor releases its executor and another caller can enter.

**Fix:** Move `balance -= cost` to immediately after the guard check, before the `try await verifyWithServer(cost:)` call. This is the CHANGE 1 site: the deduction now happens in the synchronous segment of the function, before any suspension.

**Explanation:** Swift actors guarantee mutual exclusion only within a single synchronous execution segment. When a function hits an `await`, it suspends and the actor is free to run other pending tasks. Any caller that was queued resumes and sees whatever state the actor is in at that moment. By deducting `balance` before suspending, the actor's stored state reflects the reservation immediately. The next caller will observe the reduced balance and fail the guard if funds are insufficient. This is a well-known reentrancy hazard: the actor protects shared state from simultaneous mutation, but it cannot protect stale local reads taken before a suspension from being acted on after resumption.

---

### Issue 2: Failed Server Verification Leaves Balance Incorrectly Debited

**Problem:** Once the optimistic deduction (the fix for Issue 1) is in place, a server verification failure leaves the balance permanently reduced even though the purchase did not complete. The player loses currency for a transaction that never went through.

**Fix:** Wrap `try await verifyWithServer(cost:)` in a `do/catch` block and add `balance += cost` in the catch handler before re-throwing. This is the CHANGE 2 site: it restores the reserved funds on any thrown error so the actor's balance matches reality.

**Explanation:** Deducting before the network call is necessary to close the reentrancy window, but it introduces a new invariant: the actor must undo the deduction if the server rejects or the call throws. Without the rollback, any transient network error silently destroys the player's balance. The `do/catch` rollback executes in the synchronous segment after resumption, so no other task can interleave with it. A related pitfall is partial retry logic: if a caller retries `deductCost` after a failure, and the rollback is missing, the balance gets deducted again for a transaction that was already debited, compounding the loss.
