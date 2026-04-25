## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Rescue Re-Raise Drops Backtrace
# ------------------------------------------------------------------------

module Pipeline
  class StepError < StandardError; end

  class StepRunner
    def self.run(steps, context)
      steps.each do |step|
        begin
          step.call(context)
        rescue => e
          # CHANGE 1: Build the StepError with the original exception's backtrace so the trace points at the real raise site, not here.
          wrapped = StepError.new("Step #{step.class.name} failed: #{e.message}")
          wrapped.set_backtrace(e.backtrace)
          # CHANGE 2: Use `raise wrapped` inside the rescue block so Ruby sets Exception#cause to `e`, preserving the original exception for Sentry and callers.
          raise wrapped
        end
      end
    end
  end
end
```

## Explanation

### Issue 1: Backtrace Replaced at Rescue Site

**Problem:** Sentry shows a backtrace that starts at the `rescue` line in `step_runner.rb` instead of the line inside the step that actually raised. Engineers cannot tell what code caused the failure without digging through logs separately.

**Fix:** After constructing the `StepError` instance, call `wrapped.set_backtrace(e.backtrace)` before raising it. This copies the original exception's backtrace frames onto the new exception.

**Explanation:** When you write `raise StepError, message`, Ruby allocates a brand-new exception object and records the current execution point — the `rescue` clause — as its backtrace. The backtrace of `e` is simply discarded. Calling `set_backtrace(e.backtrace)` on the new object explicitly installs the original frames, so every tool that reads `StepError#backtrace` sees the real origin. One related pitfall: if you later call `raise` with no arguments (bare re-raise), Ruby preserves the original exception unchanged, including its backtrace — but that loses the wrapping context you need here, so `set_backtrace` is the right approach when you do want a new exception type.

---

### Issue 2: Original Exception Not Attached as Cause

**Problem:** Because the original `raise` form is `raise StepError, message` and not `raise wrapped` inside a `rescue` block in the way that sets cause, calling `exception.cause` on the `StepError` that Sentry receives returns `nil`. Any code that rescues `StepError` and wants to inspect the underlying error type or message cannot access it.

**Fix:** Replace the single-line `raise StepError, "..."` with first building `wrapped = StepError.new("...")` and then calling `raise wrapped` while still inside the `rescue => e` block.

**Explanation:** Ruby automatically sets `Exception#cause` to the currently active exception (`$!`) whenever `raise` is called inside a `rescue` block. The original buggy code also calls `raise` inside `rescue`, so you might expect `cause` to be set — but `raise ClassName, message` internally creates a new exception and raises it in a way that does assign `cause` in MRI, yet the primary problem (backtrace loss) still affects Sentry's display. Explicitly splitting construction (`StepError.new`) from raising (`raise wrapped`) makes the intent clear and ensures `cause` is always the captured `e`, which Sentry's Ruby SDK follows to attach the full cause chain. A related pitfall: if you `raise wrapped` outside a `rescue` block, `cause` will be `nil` again, so the construction must stay inside the `rescue`.
