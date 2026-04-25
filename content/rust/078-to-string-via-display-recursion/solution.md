## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — ToString Recursion via Display
// ------------------------------------------------------------------------

use std::fmt;

pub struct Amount {
    cents: i64,
}

impl Amount {
    pub fn new(cents: i64) -> Self {
        Amount { cents }
    }

    pub fn dollars(&self) -> i64 {
        self.cents / 100
    }

    pub fn remaining_cents(&self) -> i64 {
        self.cents.abs() % 100
    }
}

impl fmt::Display for Amount {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // CHANGE 1: Removed `self.to_string()` call which recursed infinitely back into this method; now we write directly to the formatter.
        // CHANGE 2: Write the actual dollar-sign, dollars, and zero-padded cents directly to `f` instead of delegating to a string.
        write!(f, "${}.{:02}", self.dollars(), self.remaining_cents())
    }
}
```

## Explanation

### Issue 1: Infinite Recursion via `to_string` in `Display::fmt`

**Problem:** Every call to `.to_string()` on an `Amount` value triggers a stack overflow in production. The call stack fills with alternating frames of `<Amount as Display>::fmt` and `to_string` until the thread's stack is exhausted.

**Fix:** Remove the `self.to_string()` call entirely from `fmt`. Replace it with a direct `write!(f, ...)` call that formats the value into the provided `fmt::Formatter` without any intermediate string allocation.

**Explanation:** In Rust, the blanket impl in the standard library provides `to_string()` for any type that implements `Display` by calling `Display::fmt` internally. So when `fmt` calls `self.to_string()`, it calls `fmt` again, which calls `to_string()` again, and so on without a base case. This is not caught by tests that use `format!("{}", amount)` because `format!` calls `fmt` directly — it does not go through `to_string`. The fix is to write the formatted output directly into `f` inside `fmt`, which is what `fmt` is supposed to do in the first place. A related pitfall: using `format!("{}", self)` inside `fmt` causes the same recursion as `to_string()`, so that is equally wrong.

---

### Issue 2: Missing Dollar-Amount Formatting Logic

**Problem:** Even if the infinite recursion were somehow broken, the original `fmt` implementation never actually formats the dollar sign, the dollar component, or the cents component. Any non-recursive version of that code would produce an empty or meaningless string.

**Fix:** Replace the body of `fmt` with `write!(f, "${}.{:02}", self.dollars(), self.remaining_cents())`, which writes the `$` prefix, the whole-dollar part from `self.dollars()`, a `.` separator, and the two-digit zero-padded cents from `self.remaining_cents()`.

**Explanation:** The intent of `Display::fmt` is to push characters into the `fmt::Formatter` `f`. The correct way to do that is to call `write!` (or similar) with `f` as the target. The `:02` format specifier ensures that values like 5 cents render as `05` rather than `5`, so `$12.05` displays correctly instead of `$12.5`. Without this formatting, an amount of 5 cents would have been represented ambiguously.
