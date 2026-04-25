## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — try? Silently Discards Errors
// ------------------------------------------------------------------------

import Foundation

struct AppConfig: Decodable {
    var featureFlags: [String: Bool]
    var apiBaseURL: String
}

final class ConfigLoader {
    static func load() -> AppConfig {
        let fallback = AppConfig(featureFlags: [:], apiBaseURL: "")

        guard let url = Bundle.main.url(forResource: "config", withExtension: "json") else {
            print("Config file not found, using defaults")
            return fallback
        }

        // CHANGE 2: Use do/try/catch instead of try? so I/O errors are logged with their actual description rather than silently discarded.
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            print("Failed to read config file: \(error), using defaults")
            return fallback
        }

        // CHANGE 1: Use do/try/catch instead of try? so JSON decode errors are logged with their actual description rather than silently producing empty defaults.
        do {
            return try JSONDecoder().decode(AppConfig.self, from: data)
        } catch {
            print("Failed to decode config: \(error), using defaults")
            return fallback
        }
    }
}
```

## Explanation

### Issue 1: Silent JSON Decode Failure

**Problem:** When `JSONDecoder().decode` throws — because the bundled JSON is malformed or has a missing required key — `try?` converts the thrown error into `nil`, the `?? fallback` branch returns an empty `AppConfig`, and the app logs nothing useful. In production, users get features silently disabled and there is no signal in any log that decoding failed.

**Fix:** Replace `let config = try? JSONDecoder().decode(AppConfig.self, from: data)` with a `do { return try ... } catch { print(error); return fallback }` block, so the `DecodingError` (which contains the exact key path and type mismatch) is printed before falling back.

**Explanation:** `try?` is a deliberate Swift feature that converts any thrown error into `nil`; it is useful when you genuinely do not care what went wrong. Here you do care — the error tells you whether the JSON has a missing key, a wrong type, or is entirely unparseable. Without the error message, a `DecodingError.keyNotFound` for `apiBaseURL` looks identical to a completely valid decode that happened to produce all defaults. Wrapping the call in `do/catch` keeps the fallback logic intact while printing `error.localizedDescription` (or the full `error` for `DecodingError` detail). A related pitfall: if you later add a required property to `AppConfig` without updating the JSON file, `try?` will silently regress every user to empty defaults and you will not know.

---

### Issue 2: Silent I/O Read Failure

**Problem:** `try? Data(contentsOf: url)` discards any `NSError` from the file system — including permission errors, truncated files, or storage failures — and the existing print statement says only "Failed to read config file" with no detail. The error code and description that would identify the root cause are lost.

**Fix:** Replace the `guard let data = try? Data(contentsOf: url)` pattern with a `do { data = try Data(contentsOf: url) } catch { print(error); return fallback }` block so the underlying `NSError` domain and code (e.g., `NSCocoaErrorDomain` code 256 for an unreadable file) appear in the log.

**Explanation:** `Data(contentsOf:)` throws an `NSError` that contains the POSIX error code, the file path, and a human-readable description. `try?` throws all of that away. When a build-script bug corrupts a file, the OS may still return data for a partially readable file, or it may throw an I/O error — without capturing that error you cannot distinguish the two cases in logs. Printing `error` directly from the `catch` block surfaces the full `localizedDescription` and the underlying error, which makes it possible to correlate field reports with specific failure modes without requiring a new build.
