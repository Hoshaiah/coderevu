## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — CompactMap Silently Drops Valid Zeros
// ------------------------------------------------------------------------

import Foundation

struct MetricsProcessor {
    func processReadings(_ rawReadings: [String]) -> [Double] {
        return rawReadings.compactMap { reading in
            guard reading != "n/a" else { return nil }
            let value = Double(reading)
            // CHANGE 1: Return `value` directly (which is nil when unparseable) instead of also filtering out zero; the old `value != 0 ? value : nil` expression wrongly treated 0.0 as a sentinel meaning "no value".
            // CHANGE 2: Unparseable non-"n/a" strings now get a debug log so silent data loss is visible during development.
            if value == nil {
                print("[MetricsProcessor] Warning: could not parse reading '\(reading)'") 
            }
            return value
        }
    }
}

let processor = MetricsProcessor()
let input = ["1.5", "0.0", "n/a", "3.2", "0.0", "2.1"]
let results = processor.processReadings(input)
print(results) // Expected: [1.5, 0.0, 3.2, 0.0, 2.1], Got: [1.5, 3.2, 2.1]
```

## Explanation

### Issue 1: Zero Values Incorrectly Discarded

**Problem:** Any sensor reading that parses to `0.0` is dropped from the output as if it were missing data. Charts show a gap at every position where the sensor legitimately read zero, such as during a calibration window. The raw strings `"0.0"` are present in the input and parse successfully, so no error is raised — the values just vanish.

**Fix:** Replace `return value != 0 ? value : nil` with `return value`. `Double(reading)` already returns `nil` for unparseable strings and a valid `Double` for everything else, so no extra zero-check is needed.

**Explanation:** The original code treats `0` as a sentinel meaning "bad value", but `Double(reading)` uses `nil` for that purpose. When `reading` is `"0.0"`, `Double(reading)` returns `Optional(0.0)` — a perfectly valid, non-nil result. The ternary `value != 0 ? value : nil` then converts that valid result back to `nil`, so `compactMap` strips it. The fix relies entirely on `Double`'s own parsing: if the string is unparseable, the result is already `nil`; if it is parseable, the result is the correct `Double` regardless of its magnitude. A related pitfall: negative zero (`-0.0`) would also have been silently dropped by the old code, since `-0.0 == 0` is `true` in IEEE 754.

---

### Issue 2: Malformed Non-"n/a" Strings Drop Silently

**Problem:** The guard only matches the exact string `"n/a"`. Any other unparseable string — for example `"--"`, `"err"`, or a string with a trailing space — falls through, fails `Double(reading)`, and is silently removed by `compactMap`. There is no log entry, so data loss from unexpected formats is invisible.

**Fix:** After computing `value`, add `if value == nil { print("[MetricsProcessor] Warning: could not parse reading '\(reading)'") }` before `return value`. This preserves the same filtering behavior while making unexpected data formats observable.

**Explanation:** `compactMap` unwraps `Optional` values and drops `nil` ones — that is its job. The problem is that it cannot distinguish between a `nil` that came from an intentional `"n/a"` and one that came from a malformed string the code was not designed to handle. Without the log, a format change upstream (say, the sensor firmware starts emitting `"N/A"` with a capital letter) would cause silent data loss that only shows up as chart gaps. The warning log gives developers a concrete signal in test output and, in a production system, can be replaced with a proper telemetry call or thrown error without changing the return type.
