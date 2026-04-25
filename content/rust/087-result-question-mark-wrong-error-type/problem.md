---
slug: result-question-mark-wrong-error-type
track: rust
orderIndex: 87
title: Question Mark Silently Converts Error
difficulty: medium
tags:
  - errors
  - ownership
  - api-misuse
language: rust
---

## Context

This is in `src/ingest/loader.rs`. The `load_config` function reads a TOML config file and deserializes it. It's called at startup; any error should surface with full context so operators know whether the failure was an I/O problem (missing file, bad permissions) or a parse problem (malformed TOML).

Operators started filing tickets that on misconfigured deployments the process exits with a useless message like `"invalid type: string \"foo\", expected integer at line 3"` and no indication of which file was involved. Worse, when a file is missing entirely, the error message is just the OS error string with no file path.

The developer had tried wrapping errors in a custom `ConfigError` enum to attach context, but the `?` operator silently invokes `From` in a way that discards the extra context they intended to add.

## Buggy code

```rust
use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug)]
pub enum ConfigError {
    Io(io::Error),
    Parse(String),
}

impl From<io::Error> for ConfigError {
    fn from(e: io::Error) -> Self {
        ConfigError::Io(e)
    }
}

impl From<toml::de::Error> for ConfigError {
    fn from(e: toml::de::Error) -> Self {
        ConfigError::Parse(e.to_string())
    }
}

#[derive(Debug, serde::Deserialize)]
pub struct Config {
    pub workers: u32,
    pub queue_url: String,
}

pub fn load_config(path: &Path) -> Result<Config, ConfigError> {
    let contents = fs::read_to_string(path)?;
    let config: Config = toml::from_str(&contents)?;
    Ok(config)
}
```
