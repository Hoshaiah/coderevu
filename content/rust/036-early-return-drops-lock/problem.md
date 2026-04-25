---
slug: early-return-drops-lock
track: rust
orderIndex: 36
title: Lock Guard Dropped Before Commit
difficulty: medium
tags:
  - ownership
  - concurrency
  - resource-management
language: rust
---

## Context

This snippet is from `src/ledger/account.rs`, a simple in-memory ledger used during integration tests for a payment service. `AccountStore` wraps a `Mutex<HashMap<u64, i64>>` representing account balances. The `transfer` function should atomically debit one account and credit another.

During concurrent test runs the ledger occasionally shows corrupted balances: the debit is applied but the credit is missing, leaving the total balance in the system lower than it started. The failure is non-deterministic and only appears under load.

Team members have added extra logging and confirmed the function returns `Ok(())` in all cases. No panic is observed.

## Buggy code

```rust
use std::collections::HashMap;
use std::sync::Mutex;

pub struct AccountStore {
    balances: Mutex<HashMap<u64, i64>>,
}

impl AccountStore {
    pub fn new() -> Self {
        AccountStore { balances: Mutex::new(HashMap::new()) }
    }

    pub fn deposit(&self, id: u64, amount: i64) {
        let mut map = self.balances.lock().unwrap();
        *map.entry(id).or_insert(0) += amount;
    }

    pub fn transfer(&self, from: u64, to: u64, amount: i64) -> Result<(), String> {
        let mut map = self.balances.lock().unwrap();
        let from_bal = map.entry(from).or_insert(0);
        if *from_bal < amount {
            return Err(format!("insufficient funds in account {}", from));
        }
        *from_bal -= amount;
        drop(map); // release lock early to "reduce contention"
        let mut map2 = self.balances.lock().unwrap();
        *map2.entry(to).or_insert(0) += amount;
        Ok(())
    }
}
```
