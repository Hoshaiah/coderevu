## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Rescued Error Continues After Rollback
# ------------------------------------------------------------------------

class TransferFunds
  def self.call(source_wallet, dest_wallet, amount)
    # CHANGE 2: Guard against non-positive amounts before touching the DB to prevent silent balance corruption.
    return { success: false, error: "Amount must be positive" } unless amount.positive?

    # CHANGE 1: Move the rescue inside the transaction block so that RecordInvalid is re-raised after triggering a rollback, then caught here at the outer level.
    ActiveRecord::Base.transaction do
      source_wallet.balance -= amount
      source_wallet.save!

      dest_wallet.balance += amount
      dest_wallet.save!
    rescue ActiveRecord::RecordInvalid => e
      raise ActiveRecord::Rollback
      # CHANGE 1 (continued): Store the message so we can return it after the rolled-back transaction closes.
      @transfer_error = e.message
    end

    # CHANGE 1: Return failure only when a rollback was triggered; otherwise report success.
    if @transfer_error
      { success: false, error: @transfer_error }
    else
      { success: true }
    end
  end
end
```

## Explanation

### Issue 1: rescue placed outside transaction, suppressing rollback

**Problem:** When `dest_wallet.save!` raises `ActiveRecord::RecordInvalid`, the exception unwinds past the `transaction` block before it is rescued. At that point the transaction has already committed the debit to `source_wallet`. Accounting sees the debit row but no matching credit row, and the caller gets `{ success: false }` as if nothing was saved.

**Fix:** Move the `rescue ActiveRecord::RecordInvalid` clause inside the `transaction do … end` block. Inside the rescue, raise `ActiveRecord::Rollback` so ActiveRecord undoes all writes, then store the error message in an instance variable and return the failure hash after the transaction closes.

**Explanation:** Ruby's `rescue` on a `begin/end` or method body catches exceptions after they propagate up the call stack. Because the `rescue` was on the method body rather than inside the `transaction` block, the exception escaped the block before ActiveRecord had a chance to roll back. ActiveRecord only rolls back automatically when an unrescued exception exits the `transaction` block, or when `ActiveRecord::Rollback` is raised inside it. Moving the rescue inside the block means the exception is caught while the transaction is still open; raising `ActiveRecord::Rollback` from there signals ActiveRecord to issue `ROLLBACK` before the block returns. One related pitfall: rescuing `StandardError` or `Exception` inside a transaction without re-raising `ActiveRecord::Rollback` produces the same partial-write bug, because ActiveRecord treats a clean return from the block as a signal to commit.

---

### Issue 2: No guard against non-positive transfer amounts

**Problem:** If `amount` is zero or negative, `source_wallet.balance -= amount` either leaves the balance unchanged or increases it, and `dest_wallet.balance += amount` does the reverse. Because no validation rejects these values, the records may pass `save!` without error, silently producing nonsensical balances.

**Fix:** Add `return { success: false, error: "Amount must be positive" } unless amount.positive?` at the top of `call`, before any database work begins.

**Explanation:** `RecordInvalid` is only raised when an ActiveRecord validation fails. If the wallet model has no explicit validation requiring a positive balance (or if the resulting balance happens to remain non-negative), a zero or negative amount passes through undetected. Checking `amount.positive?` at the entry point is a domain-level guard that does not depend on database constraints or model validations. It also keeps the transaction free of work that would always be logically wrong, which makes the intent of the code clearer to future readers.
