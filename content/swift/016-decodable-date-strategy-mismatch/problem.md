---
slug: decodable-date-strategy-mismatch
track: swift
orderIndex: 16
title: JSONDecoder Date Strategy Silent Failure
difficulty: medium
tags:
  - optionals
  - decoding
  - json
  - correctness
language: swift
---

## Context

`Sources/Networking/APIDecoder.swift` configures a shared `JSONDecoder` used throughout the app. The backend returns ISO 8601 dates for most fields, but recently added an endpoint that returns Unix epoch timestamps (seconds since 1970) for a batch-export feature. A new `ExportRecord` model was added to decode this response.

The data pipeline team reports that `ExportRecord.createdAt` is always showing as the Unix epoch (January 1 1970 00:00:00 UTC) for all exported records, regardless of what the server returns. The raw JSON has been verified to contain correct numeric timestamps like `1712000000`. No crash or decoding error is ever thrown.

The team already checked that the server payload is correct by inspecting it in Charles Proxy. They also confirmed that other models using ISO 8601 strings decode correctly with the shared decoder. The `ExportRecord` model was added by a different engineer who assumed the shared decoder would handle the new format.

## Buggy code

```swift
import Foundation

// Shared decoder configured for ISO 8601 string dates
let sharedDecoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
}()

struct ExportRecord: Decodable {
    let id: String
    let createdAt: Date
    let value: Double
}

func decodeExportRecords(from data: Data) throws -> [ExportRecord] {
    return try sharedDecoder.decode([ExportRecord].self, from: data)
}

// Example payload: [{"id":"abc","createdAt":1712000000,"value":42.5}]
```
