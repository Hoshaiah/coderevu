## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Closure Captures Loop Variable By Reference
# ------------------------------------------------------------------------

module Notification
  class Dispatcher
    CHANNELS = [
      { name: "email",   adapter: EmailAdapter },
      { name: "sms",     adapter: SmsAdapter },
      { name: "push",    adapter: PushAdapter }
    ]

    def self.build_senders(message)
      senders = []

      CHANNELS.each do |channel|
        # CHANGE 1: Capture `channel` by value using a proc parameter default so each lambda closes over its own copy of the channel hash rather than sharing the same mutable binding.
        senders << lambda { |ch = channel| ch[:adapter].deliver(message) }
      end

      senders
    end

    def self.dispatch(message)
      # CHANGE 2: Raise if no channels are configured so callers get an explicit error instead of silent no-op delivery.
      raise "No channels configured in CHANNELS" if CHANNELS.empty?
      build_senders(message).each(&:call)
    end
  end
end
```

## Explanation

### Issue 1: Lambda Closes Over Mutable Block Variable

**Problem:** Every lambda in `senders` references the same `channel` binding from the `each` block. By the time `dispatch` calls the lambdas, the `each` loop has finished and `channel` holds the last element of `CHANNELS` — `{ name: "push", adapter: PushAdapter }`. All three lambdas therefore deliver through `PushAdapter`, and `EmailAdapter` and `SmsAdapter` are never called.

**Fix:** Replace `lambda { channel[:adapter].deliver(message) }` with `lambda { |ch = channel| ch[:adapter].deliver(message) }`. The default-valued parameter `ch = channel` forces Ruby to evaluate and capture the *current* value of `channel` at the moment the lambda is created, not at the moment it is called.

**Explanation:** In Ruby, a closure (lambda, proc, or block) captures the *variable binding*, not the value the variable holds at creation time. `channel` is a single local variable that is reassigned on every iteration of `each`. When all lambdas are built before any of them is called, every lambda sees whatever `channel` points to right now — which is always the last iteration's hash. The default-argument trick works because default expressions are evaluated eagerly at call-site *definition*, effectively snapshotting the current value into a new local variable `ch` that belongs exclusively to that lambda. An alternative approach is `channel.dup` stored in a local inside the block, but the default-parameter idiom is idiomatic Ruby for this exact pattern and avoids an extra variable name.

---

### Issue 2: Silent No-Op When CHANNELS Is Empty

**Problem:** If `CHANNELS` is reconfigured to an empty array (e.g., during a test setup or a misconfiguration), `dispatch` returns without delivering anything and without raising or logging. The caller assumes notifications were sent.

**Fix:** Add `raise "No channels configured in CHANNELS" if CHANNELS.empty?` at the top of `dispatch`, before `build_senders` is called.

**Explanation:** `Array#each` on an empty array is a valid no-op in Ruby, so the method completes successfully with zero side effects. Nothing in the call stack signals that delivery was skipped. Raising explicitly converts a silent failure into a loud one, making it straightforward to catch in tests and in production alerting. If a warning-only approach is preferred over raising, the same guard line can be replaced with a log statement plus an early return, but the key requirement is that the caller receives *some* signal.
