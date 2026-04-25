## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Debug Interpolation Always Evaluated
# ------------------------------------------------------------------------

require "logger"

module DataPipeline
  class Transformer
    def initialize(logger: Logger.new($stdout))
      @logger = logger
    end

    def transform(events)
      events.map do |event|
        result = apply_rules(event)
        # CHANGE 1: Pass a block to debug so the string is only built when DEBUG level is active; Ruby evaluates the block lazily, skipping inspect calls entirely at :info level.
        @logger.debug { "Transformed event #{event[:id]}: #{event.inspect} -> #{result.inspect}" }
        result
      end
    end

    private

    def apply_rules(event)
      # ... complex transformation logic ...
      event.merge(processed: true)
    end
  end
end
```

## Explanation

### Issue 1: Eager String Interpolation Ignores Log Level

**Problem:** Even though the log level is set to `:info`, the call `@logger.debug("...")` eagerly evaluates its string argument before `debug` even checks whether debug logging is enabled. At 50,000 events per second, `event.inspect` and `result.inspect` run on every single event, serializing entire Ruby objects to strings that are immediately thrown away.

**Fix:** Replace the string argument with a block: `@logger.debug { "Transformed event #{event[:id]}: #{event.inspect} -> #{result.inspect}" }`. Ruby's `Logger#debug` checks the log level first and only calls the block if debug output is actually needed.

**Explanation:** Ruby evaluates method arguments before the method body runs — that's how the language works. So `@logger.debug(some_string)` computes `some_string` unconditionally. `Logger` supports a block form precisely to avoid this: the method receives a `Proc`, checks `@level >= DEBUG`, and only calls `yield` if the level matches. At `:info`, the block is never invoked and `inspect` is never called. The cost of `inspect` on a non-trivial hash is not negligible — it allocates a string, recursively serializes every key and value, and triggers GC pressure. Multiplied by 50k events/sec that is enough to explain the 35% CPU jump observed in production. A related pitfall: the same trap exists for any logger that accepts a message argument, including Rails' `logger.debug`, structured loggers, and even `puts` inside a condition — always prefer the block form for any message that requires non-trivial construction.

---

### Issue 2: Unconditional Object Serialization Cost

**Problem:** `event.inspect` and `result.inspect` are called on every iteration of the `map` loop regardless of whether the resulting string will ever be written anywhere. The operator sees elevated CPU and higher latency that disappear the moment the logging lines are removed.

**Fix:** The block passed to `@logger.debug` at `CHANGE 1` wraps both `inspect` calls, so they execute only when the debug level is active. No additional guard clause is needed because the block form already provides the level check.

**Explanation:** `inspect` on a Ruby `Hash` allocates a new `String`, recurses into every value to call its own `inspect`, and concatenates the results. For events containing nested objects or large payloads, this can allocate hundreds of bytes per call. At 50k events/sec, that is tens of megabytes of short-lived string allocations per second, which keeps the GC busy and adds latency spikes when major GC runs. The block form eliminates this entirely at non-debug log levels because the block body never executes. If you later need more control — for example, to log only specific fields — the block also lets you compute a cheaper summary string rather than serializing the whole object.
