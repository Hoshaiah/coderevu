## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Question Mark Silently Converts Error
// ------------------------------------------------------------------------

use std::fs;
use std::io;
use std::path::Path;

#[derive(Debug)]
pub enum ConfigError {
    // CHANGE 1: Added a `path` field to the Io variant so the failing file path is always included in the error.
    Io { path: String, source: io::Error },
    // CHANGE 2: Added a `path` field to the Parse variant so the failing file path is always included in the error.
    Parse { path: String, message: String },
}

// CHANGE 1: Removed the `From<io::Error>` impl because it cannot capture the path; callers now use `.map_err` explicitly.
// CHANGE 2: Removed the `From<toml::de::Error>` impl because it cannot capture the path; callers now use `.map_err` explicitly.

#[derive(Debug, serde::Deserialize)]
pub struct Config {
    pub workers: u32,
    pub queue_url: String,
}

pub fn load_config(path: &Path) -> Result<Config, ConfigError> {
    let path_str = path.display().to_string();
    // CHANGE 1: Replace `?` with `.map_err(...)` that captures `path_str` in the `Io` variant, so the error message always names the file.
    let contents = fs::read_to_string(path).map_err(|e| ConfigError::Io {
        path: path_str.clone(),
        source: e,
    })?;
    // CHANGE 2: Replace `?` with `.map_err(...)` that captures `path_str` in the `Parse` variant, so the error message always names the file.
    let config: Config = toml::from_str(&contents).map_err(|e| ConfigError::Parse {
        path: path_str.clone(),
        message: e.to_string(),
    })?;
    Ok(config)
}
```

## Explanation

### Issue 1: I/O error loses file path

**Problem:** When `fs::read_to_string` fails (e.g., the file does not exist or permissions are wrong), the `?` operator calls `From<io::Error> for ConfigError`, which stores only the raw OS error. The resulting message is something like `"No such file or directory (os error 2)"` with no file path. Operators cannot tell which config file triggered the error.

**Fix:** The `From<io::Error>` impl is removed. The `Io` variant gains a `path: String` field alongside `source: io::Error`. The `?` on `fs::read_to_string` is replaced with `.map_err(|e| ConfigError::Io { path: path_str.clone(), source: e })?`, explicitly threading the path into the error at the call site.

**Explanation:** The `From` trait receives only the value being converted — it has no access to surrounding context like the file path. Rust's `?` operator calls `From::from` automatically, so any information not present in the original error type is permanently lost at that point. The fix captures `path_str` in a closure where the local variable is in scope, constructing the richer `Io` variant before the error propagates. A related pitfall: if you later add a helper that calls `load_config` in a loop over multiple paths, you still get a distinct, correctly-attributed error per file because the path is baked in at the `.map_err` site rather than inferred later.

---

### Issue 2: TOML parse error loses file path

**Problem:** When `toml::from_str` fails, the `?` operator calls `From<toml::de::Error> for ConfigError`, which converts the error to a `String` using `to_string()` and stores nothing else. The operator sees `"invalid type: string \"foo\", expected integer at line 3"` but has no way to know which file contains line 3.

**Fix:** The `From<toml::de::Error>` impl is removed. The `Parse` variant gains a `path: String` field alongside `message: String`. The `?` on `toml::from_str` is replaced with `.map_err(|e| ConfigError::Parse { path: path_str.clone(), message: e.to_string() })?`, attaching the file path at the call site.

**Explanation:** Like issue 1, the `From` impl is called with only the TOML error value; the file path is not passed in and cannot be reconstructed from the error alone. By switching to `.map_err`, the closure closes over `path_str`, which is computed once from `path.display().to_string()` before either fallible operation runs. This means both branches — I/O failure and parse failure — produce errors that include the file path. One pitfall to watch: `path.display()` uses the platform's path separator and may produce non-UTF-8 representations on some systems; if strict UTF-8 is required, `path.to_string_lossy()` or `path.to_str().unwrap_or("<non-utf8 path>")` are safer alternatives.
