---
slug: integer-division-truncation
track: ruby
orderIndex: 92
title: Percentage calculation always returns zero for small numerators
difficulty: easy
tags:
  - numeric
  - integer-division
  - correctness
language: ruby
---

## Context

A reporting dashboard shows conversion rates for A/B test variants. The product team noticed that many experiments show 0% conversion even when the raw numbers clearly show successful conversions. The bug only appears when the numerator is smaller than the denominator, which is nearly always for low-traffic experiments.

## Buggy code

```ruby
class ExperimentReport
  def self.conversion_rate(conversions, impressions)
    return 0 if impressions.zero?

    rate = (conversions / impressions) * 100
    rate.round(2)
  end
end

puts ExperimentReport.conversion_rate(3, 200)   # => 0.0
puts ExperimentReport.conversion_rate(150, 200) # => 100.0 (should be 75.0)
```
