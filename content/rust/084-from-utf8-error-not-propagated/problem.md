---
slug: from-utf8-error-not-propagated
track: rust
orderIndex: 84
title: UTF-8 Error Swallowed With Default
difficulty: medium
tags:
  - errors
  - strings
  - encoding
language: rust
---

## Context

This function is in `src/api/body_parser.rs`. It reads the raw bytes from an HTTP request body and converts them to a `String` for further JSON parsing. The service processes webhook payloads from a variety of third-party senders.

Operators report that certain webhooks produce malformed JSON parse errors downstream, but when they manually inspect the raw bytes the payloads look correct. Adding extra logging reveals that for some payloads the body string printed by the logger is garbled or truncated, even though the raw bytes look fine.

The issue is intermittent and correlates with payloads that contain non-ASCII characters such as accented letters or emoji, which are common in user-generated content passed through the webhook.

## Buggy code

```rust
pub fn parse_body(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_owned(),
        Err(_) => {
            // Best-effort: decode as much as possible
            let lossy = String::from_utf8_lossy(bytes);
            lossy.into_owned()
        }
    }
}

pub fn handle_webhook(raw_body: &[u8]) -> Result<serde_json::Value, String> {
    let body = parse_body(raw_body);
    serde_json::from_str(&body).map_err(|e| e.to_string())
}
```
