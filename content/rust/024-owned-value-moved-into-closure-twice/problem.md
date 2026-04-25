---
slug: owned-value-moved-into-closure-twice
track: rust
orderIndex: 24
title: Value Moved Into Closure Twice
difficulty: easy
tags:
  - ownership
  - closures
  - move-semantics
language: rust
---

## Context

This code is in `src/notifications/mailer.rs`. A background task sends email notifications by spawning one thread per recipient. The `send_batch` function takes a list of recipients and a shared template body, then spawns a thread per recipient that formats and sends the message.

The code fails to compile with `error[E0382]: use of moved value: 'template'`. A junior engineer tried to fix it by adding `.clone()` inside the loop, but then hit the same error again on the second iteration.

The template string can be large (several kilobytes), so naively cloning it once per recipient in a batch of 10,000 is measurable in allocations.

## Buggy code

```rust
use std::thread;

pub fn send_batch(recipients: Vec<String>, template: String) {
    let mut handles = vec![];
    for recipient in recipients {
        let handle = thread::spawn(move || {
            let body = template.replace("{{name}}", &recipient);
            println!("Sending to {}: {}", recipient, body);
        });
        handles.push(handle);
    }
    for h in handles {
        h.join().unwrap();
    }
}
```
