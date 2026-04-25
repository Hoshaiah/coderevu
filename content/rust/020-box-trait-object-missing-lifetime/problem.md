---
slug: box-trait-object-missing-lifetime
track: rust
orderIndex: 20
title: Boxed Trait Object Drops Borrowed Data
difficulty: hard
tags:
  - lifetimes
  - ownership
  - trait-objects
language: rust
---

## Context

This is in `src/middleware/handler.rs`. The middleware stack accepts `Box<dyn Handler>` objects. `Handler` is a local trait with a single method. A new `LoggingHandler` wraps any inner handler and logs its name, borrowing a `&str` label from the surrounding configuration struct.

The code fails to compile with a lifetime error that the developer finds confusing: the compiler complains that the borrowed label does not live long enough, even though the `Config` struct holding the label is created before the handler and is supposed to outlive it. The developer tried adding explicit lifetime parameters but kept getting errors.

The root issue is that `Box<dyn Handler>` implicitly means `Box<dyn Handler + 'static>`, so any borrow stored inside the trait object must also be `'static`.

## Buggy code

```rust
pub trait Handler {
    fn handle(&self, request: &str) -> String;
}

pub struct LoggingHandler<'a> {
    label: &'a str,
    inner: Box<dyn Handler>,
}

impl<'a> Handler for LoggingHandler<'a> {
    fn handle(&self, request: &str) -> String {
        println!("[{}] handling: {}", self.label, request);
        self.inner.handle(request)
    }
}

pub struct Config {
    pub label: String,
}

pub fn make_handler(config: &Config) -> Box<dyn Handler> {
    struct Echo;
    impl Handler for Echo {
        fn handle(&self, request: &str) -> String {
            request.to_string()
        }
    }
    Box::new(LoggingHandler {
        label: &config.label,
        inner: Box::new(Echo),
    })
}
```
