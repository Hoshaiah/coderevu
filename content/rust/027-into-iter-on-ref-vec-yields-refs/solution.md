## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — into_iter on Ref Yields References
// ------------------------------------------------------------------------

use std::io::{self, Write};

pub struct Row {
    pub fields: Vec<String>,
}

pub fn write_rows<W: Write>(writer: &mut W, rows: &[Row]) -> io::Result<()> {
    for row in rows {
        // Intended: join fields with commas and write a line.
        let line = row.fields
            .iter()
            // CHANGE 1: Use "{}", not "{:?}"; {:?} debug-formats &String as a quoted/escaped literal like "\"foo\"", but {} calls Display and yields the raw string value foo.
            .map(|f| format!("{}", f))
            .collect::<Vec<_>>()
            .join(",");
        writeln!(writer, "{}", line)?;
    }
    Ok(())
}
```

## Explanation

### Issue 1: Wrong format specifier produces quoted strings

**Problem:** The CSV output contains entries like `"foo"` or `["foo", "bar"]` instead of bare field values like `foo,bar`. Every field is wrapped in double quotes and special characters are backslash-escaped because the code uses the Debug formatter.

**Fix:** Replace `format!("{:?}", f)` with `format!("{}", f)` at the `.map` call. `{}` invokes the `Display` trait on `&String`, which writes the raw string contents with no quoting or escaping.

**Explanation:** In Rust, `{:?}` calls the `Debug` trait implementation. For `String` (and `&String`), `Debug` renders the value as a Rust string literal: it wraps the content in double quotes and escapes any internal quotes or backslashes. `{}` calls `Display`, which writes the string contents directly. When the function took `Vec<Row>` before the refactor, this bug may have been hidden by a different code path or format string; after the switch to `&[Row]`, `.iter()` yields `&String` and the debug output became visible. A related pitfall: if you later want proper CSV escaping (handling commas or quotes inside field values), you should use a real CSV library rather than a manual `join(",")`.

---
