---
slug: regex-capture-group-index-off-by-one
track: ruby
orderIndex: 7
title: Regex Capture Index Off-by-One
difficulty: medium
tags:
  - idioms
  - ruby
  - correctness
language: ruby
---

## Context

`lib/parsers/log_parser.rb` parses structured log lines emitted by a legacy Java service. Each line has the format `[LEVEL] 2024-03-15T10:22:01Z RequestID=abc123 message text`. The parser extracts severity, timestamp, request ID, and message for insertion into a centralized log aggregator.

The monitoring team noticed that the `request_id` field in the aggregator is always showing the full timestamp string instead of the request ID, and the `timestamp` field contains the log level. Alerts tied to specific request IDs are never firing.

The regex itself was validated against the format spec and matches correctly in isolation. The test suite, which only checked that `match` returned non-nil, passed green.

## Buggy code

```ruby
# lib/parsers/log_parser.rb
module Parsers
  class LogParser
    LOG_PATTERN = /\A\[(\w+)\] (\S+) RequestID=(\S+) (.+)\z/

    def self.parse(line)
      match = LOG_PATTERN.match(line)
      return nil unless match

      {
        level:      match[0],
        timestamp:  match[1],
        request_id: match[2],
        message:    match[3]
      }
    end
  end
end

# Example line:
# "[ERROR] 2024-03-15T10:22:01Z RequestID=abc123 Something went wrong"
```
