---
slug: logger-interpolation-called-unconditionally
track: ruby
orderIndex: 75
title: Debug Interpolation Always Evaluated
difficulty: easy
tags:
  - concurrency
  - performance
  - ruby
language: ruby
---

## Context

`lib/data_pipeline/transformer.rb` is a hot path in a stream-processing worker that handles roughly 50,000 events per second at peak. A developer added detailed debug logging to help trace a tricky transformation bug in staging. Before shipping the fix the logging level was set back to `:info` in production, so the debug lines were expected to be silent.

After the deploy, CPU usage on the worker nodes jumped 35% and p99 latency climbed from 4 ms to 18 ms. Nothing else changed in that deploy. Removing the new logging lines in a follow-up hotfix brought metrics back to baseline immediately.

The team is confused: if the log level is `:info`, why would `Logger::DEBUG` calls affect performance at all?

## Buggy code

```ruby
require "logger"

module DataPipeline
  class Transformer
    def initialize(logger: Logger.new($stdout))
      @logger = logger
    end

    def transform(events)
      events.map do |event|
        result = apply_rules(event)
        @logger.debug("Transformed event #{event[:id]}: #{event.inspect} -> #{result.inspect}")
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
