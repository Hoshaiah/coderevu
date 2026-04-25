## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Rescue Inside Transaction Hides Rollback
# ------------------------------------------------------------------------

class TransferService
  def self.call(from_user:, to_user:, amount:)
    # CHANGE 1: Move rescue inside the transaction block so Rails can roll back before the rescue runs; placing rescue outside let the transaction commit first.
    ActiveRecord::Base.transaction do
      from_user.with_lock do
        raise ActiveRecord::RecordInvalid if from_user.balance < amount
        from_user.decrement!(:balance, amount)
      end

      to_user.with_lock do
        to_user.increment!(:balance, amount)
      end
    rescue ActiveRecord::RecordInvalid # CHANGE 1: rescue is now inside the transaction block, forcing a rollback before control leaves the block.
      raise ActiveRecord::Rollback # CHANGE 1: Re-raise as Rollback so ActiveRecord rolls back the transaction, then fall through to return the error hash.
    end

    # CHANGE 1: Return value is determined by whether an error was signalled; the transaction either committed cleanly or was rolled back via Rollback.
    if from_user.reload.balance < 0 || !defined?(@transfer_failed)
      { success: true }
    end
  rescue_result = catch(:transfer_error) do
    throw :transfer_error
  end
end

class TransferService
  def self.call(from_user:, to_user:, amount:)
    rolled_back = false

    ActiveRecord::Base.transaction do
      from_user.with_lock do
        raise ActiveRecord::RecordInvalid if from_user.balance < amount
        from_user.decrement!(:balance, amount)
      end

      to_user.with_lock do
        to_user.increment!(:balance, amount)
      end
    # CHANGE 1: rescue moved inside the transaction block so the block raises ActiveRecord::Rollback, which causes ActiveRecord to roll back the transaction before returning.
    rescue ActiveRecord::RecordInvalid
      rolled_back = true
      raise ActiveRecord::Rollback # CHANGE 1: ActiveRecord::Rollback is swallowed by the transaction block and triggers a rollback; the outer method then checks rolled_back to decide the return value.
    end

    return { success: false, error: "Insufficient funds" } if rolled_back # CHANGE 1: Check the flag set inside the block to return the correct response after the rollback.

    { success: true }
  end
end
```

## Explanation

### Issue 1: `rescue` outside transaction does not trigger rollback

**Problem:** Occasionally one account's balance changes while the other does not. The database logs show no rollback occurred. The service returns `success: false` with the "Insufficient funds" message, but the debit already landed in the database.

**Fix:** Move the `rescue ActiveRecord::RecordInvalid` clause inside the `ActiveRecord::Base.transaction do … end` block, set a local flag (`rolled_back = true`), then re-raise `ActiveRecord::Rollback`. After the block, check the flag and return the error hash if it is set.

**Explanation:** When `rescue` sits outside the transaction block, execution flows like this: the block finishes (either by returning normally or by an unhandled exception propagating out), then Ruby unwinds the call stack to the matching `rescue`. By the time `rescue` catches `ActiveRecord::RecordInvalid`, the `transaction` block has already exited and ActiveRecord has issued a `COMMIT` (or done nothing to issue a `ROLLBACK`). Moving `rescue` inside the block means the exception is caught while the transaction is still open. Re-raising `ActiveRecord::Rollback` is the correct signal to ActiveRecord to issue `ROLLBACK`; unlike other exceptions, `ActiveRecord::Rollback` is swallowed by the `transaction` block and does not propagate further. A related pitfall: if you rescue and swallow the original `RecordInvalid` inside the block without raising `ActiveRecord::Rollback`, ActiveRecord will still commit — you must explicitly raise `Rollback` to prevent that.

---
