## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — JSONDecoder Date Strategy Silent Failure
// ------------------------------------------------------------------------

import Foundation

// Shared decoder configured for ISO 8601 string dates
let sharedDecoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .iso8601
    return decoder
}()

// CHANGE 1: Create a dedicated decoder for ExportRecord that uses .secondsSince1970 instead of .iso8601, because the batch-export endpoint sends numeric Unix timestamps, not ISO 8601 strings.
let exportDecoder: JSONDecoder = {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .secondsSince1970
    return decoder
}()

struct ExportRecord: Decodable {
    let id: String
    let createdAt: Date
    let value: Double
}

func decodeExportRecords(from data: Data) throws -> [ExportRecord] {
    // CHANGE 2: Use exportDecoder (secondsSince1970) instead of sharedDecoder (iso8601) so numeric timestamps like 1712000000 are parsed correctly.
    return try exportDecoder.decode([ExportRecord].self, from: data)
}

// Example payload: [{"id":"abc","createdAt":1712000000,"value":42.5}]
```

## Explanation

### Issue 1: Wrong dateDecodingStrategy for numeric timestamps

**Problem:** `sharedDecoder` is configured with `.iso8601`, which expects date values to be JSON strings in ISO 8601 format (e.g. `"2024-04-01T12:00:00Z"`). When it encounters a numeric value like `1712000000`, it cannot parse it as an ISO 8601 string, so it falls back to the default `Date` value — which is the reference date (Unix epoch, January 1 1970). No error is thrown, so the caller never knows decoding silently produced a wrong date.

**Fix:** A new `exportDecoder` constant is introduced with `decoder.dateDecodingStrategy = .secondsSince1970`, matching the numeric format the batch-export endpoint actually returns.

**Explanation:** `JSONDecoder` applies a single `dateDecodingStrategy` to every `Date` property it decodes. The `.iso8601` strategy calls `ISO8601DateFormatter` under the hood, which requires a string value in the JSON. When the JSON value is a number, the formatter receives something it cannot interpret and returns `nil`; `JSONDecoder` then substitutes `Date(timeIntervalSinceReferenceDate: 0)` — the epoch — rather than throwing. The `.secondsSince1970` strategy reads the JSON number directly as a `Double` and passes it to `Date(timeIntervalSince1970:)`, which is exactly what the server intends. A related pitfall: if the server ever switches to milliseconds instead of seconds, you would need `.millisecondsSince1970` or a custom strategy — always confirm the unit with the API spec.

---

### Issue 2: decodeExportRecords uses the wrong decoder instance

**Problem:** Even after creating a correctly configured decoder, `decodeExportRecords` passes `data` to `sharedDecoder`, so `ExportRecord` values still decode with the `.iso8601` strategy and still produce epoch dates. The function signature gives no indication which decoder it will use, so the bug is easy to miss in review.

**Fix:** The call site inside `decodeExportRecords` is changed from `sharedDecoder.decode(...)` to `exportDecoder.decode(...)`, wiring the function to the decoder that has `.secondsSince1970` configured.

**Explanation:** Having a correctly configured decoder is useless if the decoding call still references the old one. Swift closures and `let` constants are not linked by naming convention alone — the actual variable referenced in the `decode` call determines which strategy runs. Since `sharedDecoder` is a module-level `let`, both decoders are in scope and the compiler accepts either without complaint. The fix makes the dependency explicit: `decodeExportRecords` owns a contract that its input data contains Unix epoch timestamps, and `exportDecoder` encodes that contract. Other models that use ISO 8601 strings continue to use `sharedDecoder` unchanged.
