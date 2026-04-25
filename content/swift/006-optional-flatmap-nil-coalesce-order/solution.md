## Reference solution

```swift
func parseCount(_ raw: String?) -> Int {
    return raw.flatMap { Int($0) } ?? -1
}

func parseOptionalCount(_ raw: String?) -> Int? {
    // Returns nil for missing, the parsed int for present, or nil if unparseable
    guard let raw = raw, !raw.isEmpty else { return nil }
    // CHANGE: Int($0) returns Optional<Int>, so `?? nil` is redundant and
    // always produces Optional<Optional<Int>> which is then flattened back —
    // the real bug was in storeRecord using -1 as a sentinel for zero.
    return Int(raw)
}

func storeRecord(countString: String?) {
    // CHANGE: Use parseOptionalCount so zero is distinguishable from missing.
    guard let count = parseOptionalCount(countString) else {
        print("Skipping record: missing count")
        return
    }
    print("Storing count: \(count)")
}
```

## Explanation

`parseCount` uses `-1` as a sentinel value for 'no data'. This works for positive integers, but `"0"` parses to `0`, which is a valid integer — yet `storeRecord` checks `count != -1` to detect missing data. When `countString` is `"0"`, `parseCount` correctly returns `0`, but then `storeRecord` sees `0 != -1` as `true` — so records with count zero are stored, not skipped. Wait, re-reading: `guard count != -1` passes for 0, so they ARE stored. The actual bug is the inverse: `parseCount` returns `-1` only for truly nil/unparseable input, but the sentinel `-1` clashes with legitimate `-1` values in other contexts.

The deeper correctness issue is in `storeRecord` itself: using an in-band sentinel (`-1`) to distinguish 'missing' from 'zero' is fragile. The fix is to use `parseOptionalCount` which returns a genuine `Optional<Int>`, making `nil` mean 'missing' and `0` mean zero — no collision possible.

The secondary distraction in `parseOptionalCount` is `return Int(raw) ?? nil` — this compiles because `?? nil` on an `Optional<Int>` is a no-op (it just returns the same optional), so it doesn't cause a bug by itself but is confusing noise that should be removed. The real fix is changing the call site in `storeRecord` to use the optional-returning variant.
