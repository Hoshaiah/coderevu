## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Class-Level Accessor Shared State
# ------------------------------------------------------------------------

module Export
  class ReportBuilder
    # CHANGE 1: Removed `class << self; attr_accessor :current_config; end` — storing config as class-level state is shared across all threads and causes data bleeding between concurrent jobs.

    def self.build(config)
      # CHANGE 2: Pass `config` as an explicit argument to each private method instead of writing it to class state; this keeps config local to each thread's call stack.
      rows = fetch_records(config).map { |r| format_row(r, config) }
      write_csv(rows)
    end

    def self.fetch_records(config)
      Account.where(plan: config[:plan]).limit(1000)
    end

    def self.format_row(record, config)
      [record.id, record.name, config[:currency]]
    end

    def self.write_csv(rows)
      CSV.generate { |csv| rows.each { |r| csv << r } }
    end
  end
end
```

## Explanation

### Issue 1: Class-level state shared across threads

**Problem:** `attr_accessor :current_config` defined inside `class << self` creates a single getter/setter on the class object itself. Every thread that calls `ReportBuilder.build` reads and writes the same memory location. In production with 10 Sidekiq threads, a thread processing tenant A's report can have its `current_config` overwritten by a thread starting tenant B's job, so tenant A's CSV rows are built using tenant B's plan and currency.

**Fix:** Delete the `class << self; attr_accessor :current_config; end` block entirely. It is gone from the reference solution with no replacement at the class level.

**Explanation:** A Ruby class is itself an object, and instance variables set on it (which is what a class-level `attr_accessor` creates) are shared state — one copy for the entire process. Thread 1 sets `self.current_config = config_for_tenant_a`, then the OS context-switches to Thread 2, which sets `self.current_config = config_for_tenant_b`. Thread 1 resumes and calls `current_config[:currency]`, now reading tenant B's value. Because there is no mutex, this is a classic unsynchronized write-then-read across threads. Adding a mutex would fix the race but would serialize all report jobs; the better fix is to eliminate shared state entirely.

---

### Issue 2: Config passed through global state instead of method arguments

**Problem:** Even if the race were somehow avoided, routing config through a class-level variable instead of method arguments makes the call chain stateful and fragile. Any method in any future code path that calls `fetch_records` or `format_row` without first setting `current_config` will silently use whatever config was set last, producing wrong output with no exception raised.

**Fix:** Add a `config` parameter to `fetch_records` and `format_row`, and pass the local `config` variable from `build` into each call. `self.fetch_records(config)` and `format_row(r, config)` replace the zero-argument calls, and both methods read from their own parameter instead of from the class accessor.

**Explanation:** Method arguments live on the call stack, which is per-thread in Ruby (and in virtually every other runtime). Passing `config` as an argument means each thread carries its own copy of the reference through the entire call chain with no shared memory involved. This also makes each method independently testable — you can call `ReportBuilder.format_row(record, {currency: 'USD'})` in a unit test without setting up any class-level state first. A related pitfall to watch for: if `config` were a mutable hash and a method mutated it in place (e.g., `config[:plan] = nil`), threads sharing the same hash object could still interfere; here each job passes its own freshly built hash so that is not a concern.
