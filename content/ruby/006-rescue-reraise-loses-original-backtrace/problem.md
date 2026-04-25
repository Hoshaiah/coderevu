---
slug: rescue-reraise-loses-original-backtrace
track: ruby
orderIndex: 6
title: Rescue Re-Raise Drops Backtrace
difficulty: easy
tags:
  - idioms
  - ruby
  - concurrency
language: ruby
---

## Context

`lib/pipeline/step_runner.rb` runs a sequence of processing steps and wraps any failure in a `Pipeline::StepError` that includes the step name for operator visibility. The error handling was written to ensure the original exception is always re-raised so Sentry can capture it with full context.

The on-call team has been complaining that Sentry alerts for pipeline failures show a backtrace that starts at the `rescue` clause in `step_runner.rb` rather than at the actual line that raised the original exception. This makes it very hard to identify which line inside a step caused the failure without reading logs.

The team confirmed that Sentry is configured correctly and captures other exceptions with full backtraces. The issue is specific to exceptions that pass through `StepRunner`.

## Buggy code

```ruby
module Pipeline
  class StepError < StandardError; end

  class StepRunner
    def self.run(steps, context)
      steps.each do |step|
        begin
          step.call(context)
        rescue => e
          # Wrap and re-raise so logs show which step failed
          raise StepError, "Step #{step.class.name} failed: #{e.message}"
        end
      end
    end
  end
end
```
