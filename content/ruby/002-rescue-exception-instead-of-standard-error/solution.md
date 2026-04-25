## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Rescue Catches SignalException
# ------------------------------------------------------------------------

module ExternalApiClient
  MAX_RETRIES = 3

  def self.with_retry(&block)
    attempts = 0
    begin
      attempts += 1
      block.call
    # CHANGE 1: Rescue StandardError instead of Exception so that SignalException (SIGTERM, SIGINT, etc.) and other non-StandardError exceptions propagate normally and are never swallowed by this handler.
    rescue StandardError => e
      # CHANGE 2: Raise immediately when attempts exceeds MAX_RETRIES (use >) so the block is called at most MAX_RETRIES times total, not MAX_RETRIES+1.
      raise if attempts > MAX_RETRIES
      sleep(2 ** attempts)
      retry
    end
  end
end
```

## Explanation

### Issue 1: `rescue Exception` swallows SIGTERM

**Problem:** When the app receives `SIGTERM` (e.g., during a deploy), Ruby converts the signal into a `SignalException` and raises it inside whatever code is running. Because `SignalException` is a subclass of `Exception` but not of `StandardError`, the `rescue Exception` clause catches it, treats it like a network error, and retries the block. The process never terminates until `kill -9` is used.

**Fix:** Replace `rescue Exception => e` with `rescue StandardError => e`. `StandardError` is the parent of all ordinary runtime errors (`Timeout::Error`, `Net::HTTPError`, `Errno::ECONNRESET`, etc.) but does not include `SignalException`, `Interrupt`, or `SystemExit`.

**Explanation:** Ruby's exception hierarchy has `Exception` at the root, with `SignalException` and `StandardError` as separate branches underneath it. `rescue Exception` catches everything, including signals. When `SIGTERM` arrives mid-retry-loop, the handler catches the resulting `SignalException`, checks `attempts >= MAX_RETRIES` (which is false on early attempts), sleeps, and then calls `retry` — restarting the block completely. The signal is consumed and the process keeps running. Switching to `rescue StandardError` leaves the `SignalException` unhandled by this block, so it propagates up the call stack and terminates the process as expected. A related pitfall: `rescue Exception` also swallows `NoMemoryError` and `ScriptError`, masking serious VM-level problems.

---

### Issue 2: Off-by-one allows an extra retry attempt

**Problem:** With `MAX_RETRIES = 3` and the condition `raise if attempts >= MAX_RETRIES`, the block is actually called four times: on the third failure `attempts` equals `3`, the condition is true and it raises — but by then three failures have already happened and a fourth call has been made. Operators expecting at most three total calls (i.e., the initial call plus two retries) will see more retries and longer delays than intended.

**Fix:** Change `raise if attempts >= MAX_RETRIES` to `raise if attempts > MAX_RETRIES`. This causes the rescue block to re-raise after the third failure, so the block is called at most `MAX_RETRIES` (3) times.

**Explanation:** `attempts` is incremented before the block runs and before any rescue logic executes. After the first failure `attempts` is `1`; `1 >= 3` is false, so it retries. After the second failure `attempts` is `2`; still false. After the third failure `attempts` is `3`; `3 >= 3` is true, so it raises — but the block has already run three times. Adding a fourth attempt means one extra `sleep(2 ** 3)` = 8-second pause plus one more network call before giving up. Using `>` instead of `>=` raises after exactly `MAX_RETRIES` total attempts, matching the documented intent.
