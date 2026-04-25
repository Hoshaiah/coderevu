---
slug: transaction-rescue-swallows-rollback
track: ruby
orderIndex: 36
title: Rescue Inside Transaction Hides Rollback
difficulty: hard
tags:
  - active-record
  - rails
  - concurrency
  - error-handling
language: ruby
---

## Context

`app/services/transfer_service.rb` moves credits between two user accounts atomically. It wraps the two updates in a transaction and rescues `ActiveRecord::RecordInvalid` to return a friendly error message instead of raising. This pattern is copied from the Rails guides example for transactions and seemed correct.

Occasionally, operations complete with `success: false` but one account's balance is actually updated in the database while the other is not — a split-brain state. Database logs confirm the transaction was not rolled back in those cases. The bug is difficult to reproduce locally but appears in production roughly once per few hundred transfers.

The team has already added a unique constraint and checked for race conditions in the debit/credit logic. The bug is in the error-handling layer itself.

## Buggy code

```ruby
class TransferService
  def self.call(from_user:, to_user:, amount:)
    ActiveRecord::Base.transaction do
      from_user.with_lock do
        raise ActiveRecord::RecordInvalid if from_user.balance < amount
        from_user.decrement!(:balance, amount)
      end

      to_user.with_lock do
        to_user.increment!(:balance, amount)
      end
    end

    { success: true }
  rescue ActiveRecord::RecordInvalid
    { success: false, error: "Insufficient funds" }
  end
end
```
