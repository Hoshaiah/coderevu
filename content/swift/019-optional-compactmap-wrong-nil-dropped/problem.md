---
slug: optional-compactmap-wrong-nil-dropped
track: swift
orderIndex: 19
title: CompactMap Silently Drops Valid Zeros
difficulty: medium
tags:
  - optionals
  - correctness
  - collections
  - swift-stdlib
language: swift
---

## Context

This code is in `MetricsProcessor.swift`, a background worker in an analytics pipeline that ingests raw sensor readings. Each reading is a string that may be a numeric value or the literal string `"n/a"` for missing data. The processor converts valid readings to `Double` and discards missing ones. The results feed into a chart renderer.

Data scientists report that charts occasionally show gaps at positions where they expect zero readings — for example, a sensor that legitimately read `0.0` during a calibration window. The raw data files confirm `"0.0"` strings are present in the input. No errors are logged.

The team added print statements and confirmed the `rawReadings` array contains the expected strings. The issue only appears when zero values are present in the data set, which is uncommon in production but common in test data.

## Buggy code

```swift
import Foundation

struct MetricsProcessor {
    func processReadings(_ rawReadings: [String]) -> [Double] {
        return rawReadings.compactMap { reading in
            guard reading != "n/a" else { return nil }
            let value = Double(reading)
            // Return nil for non-parseable strings and for zero
            return value != 0 ? value : nil
        }
    }
}

let processor = MetricsProcessor()
let input = ["1.5", "0.0", "n/a", "3.2", "0.0", "2.1"]
let results = processor.processReadings(input)
print(results) // Expected: [1.5, 0.0, 3.2, 0.0, 2.1], Got: [1.5, 3.2, 2.1]
```
