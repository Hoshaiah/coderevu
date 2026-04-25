## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Boxed Trait Object Drops Borrowed Data
// ------------------------------------------------------------------------

pub trait Handler {
    fn handle(&self, request: &str) -> String;
}

// CHANGE 1: Replaced &'a str with owned String so LoggingHandler satisfies the implicit 'static bound on Box<dyn Handler>.
pub struct LoggingHandler {
    label: String,
    inner: Box<dyn Handler>,
}

// CHANGE 1: Removed the 'a lifetime parameter from the impl block since LoggingHandler no longer borrows anything.
impl Handler for LoggingHandler {
    fn handle(&self, request: &str) -> String {
        println!("{} handling: {}", self.label, request);
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
    // CHANGE 2: Clone config.label into an owned String instead of borrowing it, so the returned Box<dyn Handler + 'static> owns all its data.
    Box::new(LoggingHandler {
        label: config.label.clone(),
        inner: Box::new(Echo),
    })
}
```

## Explanation

### Issue 1: `Box<dyn Handler>` implicit `'static` bound

**Problem:** The compiler rejects `Box::new(LoggingHandler { label: &config.label, ... })` with a lifetime error. The error message says the borrow does not live long enough, even though `Config` appears to outlive the handler at the call site.

**Fix:** Change `label: &'a str` to `label: String` in `LoggingHandler` and remove the `'a` lifetime parameter from the struct and its `impl` block (`// CHANGE 1`).

**Explanation:** In Rust, `Box<dyn Trait>` is shorthand for `Box<dyn Trait + 'static>`. The `'static` bound means every reference stored inside the trait object must be valid for the entire program lifetime. `LoggingHandler<'a>` holds a `&'a str`, and `'a` is tied to the lifetime of the `Config` argument — not `'static`. The compiler therefore refuses to coerce `LoggingHandler<'a>` into `Box<dyn Handler + 'static>` regardless of where `Config` is declared. The fix eliminates the borrow entirely: storing an owned `String` instead of a reference makes `LoggingHandler` own all its data, satisfying `'static` with no lifetime parameters needed.

---

### Issue 2: Borrow of `config.label` prevents owned return value

**Problem:** `make_handler` takes `config: &Config` and tries to return a `Box<dyn Handler>` that internally points at `config.label`. Because the returned box must outlive the `&Config` borrow, the compiler would never allow this even if the `'static` issue were worked around with a lifetime-parameterized trait object.

**Fix:** Replace `label: &config.label` with `label: config.label.clone()` at the `LoggingHandler` construction site (`// CHANGE 2`), so the box owns a fresh `String`.

**Explanation:** Even if you changed the return type to `Box<dyn Handler + '_>` to thread the lifetime through, callers that store the box beyond the `Config`'s scope would still fail. The proper fix is to clone the label once at construction time. `String::clone` is an O(n) allocation, but it only happens when the handler is built, not on every request. A related pitfall: if you have many short-lived `Config` values creating handlers that are stored long-term, cloning is the only correct option; `Arc<str>` or `Rc<str>` are alternatives if you want to avoid duplicating the heap allocation.
