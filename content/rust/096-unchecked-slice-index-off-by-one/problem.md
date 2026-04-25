---
slug: unchecked-slice-index-off-by-one
track: rust
orderIndex: 96
title: >-
  CSV column parser panics with index-out-of-bounds on rows with a trailing
  comma
difficulty: easy
tags:
  - indexing
  - off-by-one
  - correctness
  - strings
language: rust
---

## Context

This function is part of a lightweight CSV ingest pipeline. It splits each line by comma and extracts the columns by index. During a data migration the team started receiving files where some rows have a trailing comma (a common Excel export quirk), and the service started panicking in production.

## Buggy code

```rust
pub fn extract_columns(line: &str, indices: &[usize]) -> Vec<String> {
    let columns: Vec<&str> = line.split(',').collect();
    indices.iter().map(|&i| columns[i].trim().to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic() {
        let result = extract_columns("alice,30,engineer", &[0, 2]);
        assert_eq!(result, vec!["alice", "engineer"]);
    }
}
```
