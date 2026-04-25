---
slug: closure-capture-loop-variable
track: rust
orderIndex: 34
title: Closure Captures Loop Index Late
difficulty: medium
tags:
  - ownership
  - lifetimes
  - closures
language: rust
---

## Context

This code is in `src/scheduler/tasks.rs` and builds a list of retry closures for a set of pending tasks. Each closure is supposed to capture the task's unique index so that when invoked it can log which task is retrying.

In the logs, every retry message prints the same task index — always the index of the last task — regardless of which task is actually retrying. The bug was introduced when someone refactored from explicit struct callbacks to closures for brevity.

The developer checked that the `tasks` vector has the right number of entries and that each closure is called the correct number of times. The indices logged are all identical, pointing to a capture issue rather than a call-ordering issue.

## Buggy code

```rust
pub fn build_retry_closures(task_count: usize) -> Vec<Box<dyn Fn()>> {
    let mut closures: Vec<Box<dyn Fn()>> = Vec::new();
    let mut index = 0;

    while index < task_count {
        closures.push(Box::new(|| {
            println!("Retrying task {}", index);
        }));
        index += 1;
    }

    closures
}
```
