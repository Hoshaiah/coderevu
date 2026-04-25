---
slug: rescue-in-transaction-continues
track: ruby
orderIndex: 38
title: Rescued Error Continues After Rollback
difficulty: hard
tags:
  - active-record
  - rails
  - concurrency
  - error-handling
language: ruby
---

## Context

This service object is in `app/services/transfer_funds.rb` and moves money between two wallet records. It wraps the updates in a transaction and rescues `ActiveRecord::RecordInvalid` to return a user-friendly error message instead of raising.

Accounting reports that transfer amounts are occasionally debited from the source wallet but never credited to the destination. The database shows the debit row present but no matching credit. The service returns `{ success: false, error: "..." }` in these cases, so the caller believes the transfer failed cleanly.

The team added extensive logging and confirmed that `source.save!` succeeds before the error fires, and that the rescue block is reached. They assumed the transaction must be rolling back the debit — it is not.

## Buggy code

```ruby
class TransferFunds
  def self.call(source_wallet, dest_wallet, amount)
    ActiveRecord::Base.transaction do
      source_wallet.balance -= amount
      source_wallet.save!

      dest_wallet.balance += amount
      dest_wallet.save!
    end
    { success: true }
  rescue ActiveRecord::RecordInvalid => e
    { success: false, error: e.message }
  end
end
```
