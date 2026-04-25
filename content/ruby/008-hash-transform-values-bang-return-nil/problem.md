---
slug: hash-transform-values-bang-return-nil
track: ruby
orderIndex: 8
title: transform_values! Returns Nil on Noop
difficulty: medium
tags:
  - idioms
  - ruby
  - mutability
language: ruby
---

## Context

`lib/normalizers/metric_normalizer.rb` prepares a hash of metric readings before they are shipped to a time-series database. One step strips whitespace from any string values — numeric values pass through unchanged. The normalizer is used in a streaming pipeline where thousands of metric hashes are processed per second.

The pipeline intermittently drops entire metric payloads. Logs show the normalizer returning `nil` for roughly 30% of hashes. Engineers noticed the failures correlate with metrics that contain only numeric values and no string fields.

Adding a `.to_s` call on the returned value before logging shows `""` for the failing cases, confirming `nil` is returned rather than an exception raised.

## Buggy code

```ruby
# lib/normalizers/metric_normalizer.rb
module Normalizers
  class MetricNormalizer
    def self.call(metrics)
      stripped = metrics.transform_values! do |v|
        v.is_a?(String) ? v.strip : v
      end

      stripped
    end
  end
end

# Example usage:
# MetricNormalizer.call({ cpu: 0.82, memory: 0.61 })  # => nil  (BUG)
# MetricNormalizer.call({ host: "  web-01 ", cpu: 0.82 })  # => { host: "web-01", cpu: 0.82 }
```
