## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Regex Capture Index Off-by-One
# ------------------------------------------------------------------------

# lib/parsers/log_parser.rb
module Parsers
  class LogParser
    LOG_PATTERN = /\A\[(\w+)\] (\S+) RequestID=(\S+) (.+)\z/

    def self.parse(line)
      match = LOG_PATTERN.match(line)
      return nil unless match

      {
        # CHANGE 1: Shift all indices up by 1; match[0] is the full match string, capture groups start at match[1].
        level:      match[1],
        timestamp:  match[2],
        request_id: match[3],
        message:    match[4]
      }
    end
  end
end

# Example line:
# "[ERROR] 2024-03-15T10:22:01Z RequestID=abc123 Something went wrong"
```

## Explanation

### Issue 1: Capture Group Index Off-by-One

**Problem:** Every field in the returned hash holds the value from the wrong capture group. `level` receives the full matched line, `timestamp` receives the log level (e.g. `ERROR`), `request_id` receives the timestamp string, and `message` receives the request ID. The monitoring team sees timestamps in the request ID field, so alerts keyed on request ID never fire.

**Fix:** Replace `match[0]`, `match[1]`, `match[2]`, `match[3]` with `match[1]`, `match[2]`, `match[3]`, `match[4]` respectively, so each key reads from the correct numbered capture group.

**Explanation:** In Ruby's `MatchData`, index `0` is always the entire substring that the regex matched — not the first capture group. Capture groups are numbered starting at `1`. The buggy code used `match[0]` for `level`, which returns the whole line, and then `match[1]` for `timestamp`, which returns what the first capture group `(\w+)` actually captured (the log level). Every subsequent field is shifted one position earlier than intended. Fixing it means reading `match[1]` through `match[4]`, aligning each key with the capture group the regex author intended. A related pitfall: named captures via `match[:name]` bypass this confusion entirely and are worth using when the group count grows.

---

### Issue 2: Test Suite Lacks Field-Level Assertions

**Problem:** The existing tests only assert that `LOG_PATTERN.match(line)` returns a non-nil value. They never check what the individual fields in the parsed hash contain, so the wrong index assignments passed every test run undetected.

**Fix:** There is no code change in `log_parser.rb` itself for this issue — the fix belongs in the test file. Each test should assert the exact expected value for `level`, `timestamp`, `request_id`, and `message` on the hash returned by `LogParser.parse`.

**Explanation:** A regex match returning non-nil only confirms that the pattern matched somewhere in the input. It says nothing about whether the captured groups are read back correctly. A test that calls `parser.parse(line)[:request_id]` and compares it to `"abc123"` would have failed immediately when `match[2]` (the timestamp) was assigned there instead. Field-level assertions catch this entire class of index and assignment bugs. Adding one `assert_equal` per output field for at least one representative input is the minimum bar for a parser test.
