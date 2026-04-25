---
slug: closure-moves-string-in-loop
track: rust
orderIndex: 39
title: Closure Moves String Every Iteration
difficulty: medium
tags:
  - ownership
  - closure
  - borrowing
  - correctness
language: rust
---

## Context

`src/notifications/dispatcher.rs` sends a notification message to a list of recipients. The `prefix` string is constructed once (it contains a timestamp and request ID) and should be prepended to the body for each recipient's message. The function is called from a background worker thread after each completed order.

The code does not compile. The error is `use of moved value: prefix` on the second and subsequent loop iterations. A junior engineer attempted to fix it by cloning `prefix` inside the loop, which worked but was flagged in code review as unnecessary since the closure only reads the string.

The reviewer asked the engineer to find a solution that does not clone the string at all. The surrounding infrastructure cannot be changed — `send_to` must accept `String`, not `&str`.

## Buggy code

```rust
fn send_to(recipient: &str, message: String) {
    println!("Sending to {}: {}", recipient, message);
}

pub fn dispatch(recipients: &[&str], prefix: String, body: &str) {
    let make_message = |r: &&str| {
        let full = format!("{}: {}", prefix, body);
        send_to(r, full);
    };
    recipients.iter().for_each(make_message);
}
```
