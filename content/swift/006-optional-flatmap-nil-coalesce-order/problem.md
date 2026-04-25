---
slug: optional-flatmap-nil-coalesce-order
track: swift
orderIndex: 6
title: Optional FlatMap Nil-Coalescing Precedence
difficulty: easy
tags:
  - optionals
  - swift-operators
  - correctness
language: swift
---

## Context

This utility function lives in `Sources/Utilities/StringParsing.swift` and is used across several analytics pipelines to convert raw strings from a CSV import into integers before storing them in Core Data. It was written quickly to handle both missing values (empty string) and numeric strings.

QA started flagging that records where the CSV column contains `"0"` are being treated as if the column were empty — the default value of `-1` is being stored instead of `0`. Records with any other non-empty integer string are processed correctly.

The team checked the CSV parser and verified it is producing the string `"0"` correctly. The Core Data model was also inspected and the field accepts `-1` as a valid sentinel for 'missing'. The bug is somewhere in the parsing helper itself.

## Buggy code

```swift
func parseCount(_ raw: String?) -> Int {
    return raw.flatMap { Int($0) } ?? -1
}

func parseOptionalCount(_ raw: String?) -> Int? {
    // Returns nil for missing, the parsed int for present, or nil if unparseable
    guard let raw = raw, !raw.isEmpty else { return nil }
    return Int(raw) ?? nil
}

func storeRecord(countString: String?) {
    let count = parseCount(countString)
    guard count != -1 else {
        print("Skipping record: missing count")
        return
    }
    print("Storing count: \(count)")
}
```
