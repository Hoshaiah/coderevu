## Reference solution

```rust
// ------------------------------------------------------------------------
// ANSWER — Lifetime Annotation Outlives Field
// ------------------------------------------------------------------------

pub struct TokenStream<'a> {
    source: &'a str,
    pos: usize,
}

impl<'a> TokenStream<'a> {
    pub fn new(source: &'a str) -> Self {
        TokenStream { source, pos: 0 }
    }

    pub fn next_token(&mut self) -> Option<&'a str> {
        // skip leading whitespace first so `start` points at real content
        while self.pos < self.source.len()
            && self.source.as_bytes()[self.pos].is_ascii_whitespace()
        {
            self.pos += 1;
        }
        let start = self.pos;
        while self.pos < self.source.len()
            && !self.source.as_bytes()[self.pos].is_ascii_whitespace()
        {
            self.pos += 1;
        }
        // CHANGE 2: use `self.pos` (one past last token byte) as the end, not `self.pos - 1`; the old code subtracted 1 which cut the last character and could underflow when pos==0.
        if start == self.pos {
            None
        } else {
            Some(&self.source[start..self.pos])
        }
    }
}

// CHANGE 1: make_stream now accepts a pre-built &'a str so the TokenStream can borrow data that outlives this call; the old version built a local `owned` String and tried to return a borrow of it, which is a use-after-free that the borrow checker correctly rejects.
pub fn make_stream(input: &str) -> String {
    format!("prefix_{}", input)
}

// Caller is responsible for keeping the String alive and then constructing the stream:
// let buf = make_stream(input);
// let mut stream = TokenStream::new(&buf);
```

## Explanation

### Issue 1: Dangling borrow of local String in make_stream

**Problem:** `make_stream` creates a `String` named `owned`, passes a reference to it into `TokenStream::new`, and then returns the `TokenStream`. At the closing brace `owned` is dropped, so the `TokenStream` immediately holds a dangling pointer. The current Rust compiler rejects this with a borrow-checker error along the lines of "`owned` does not live long enough".

**Fix:** Remove the attempt to construct a `TokenStream` inside `make_stream`. Instead, `make_stream` returns the `String` it builds, and the caller holds that `String` long enough to create a `TokenStream` from a borrow of it — two separate statements, each with the right lifetime.

**Explanation:** Rust's borrow checker enforces that a reference cannot outlive the value it points to. When `make_stream` assigns the lifetime `'a` of its `input` parameter to the returned `TokenStream`, it promises the caller that the stream's source data lives as long as `'a`. But `owned` is a fresh allocation local to the function body; its lifetime ends when the function returns, which is shorter than `'a`. The compiler sees that the returned `TokenStream<'a>` would contain a reference to freed memory and refuses to compile. The fix separates allocation from borrowing: the allocation (`String`) is returned to the caller, and the borrow only starts once the caller holds a stable storage location.

---

### Issue 2: Off-by-one slice endpoint in next_token

**Problem:** `next_token` first advances `self.pos` past the non-whitespace characters of a token, then advances it again past trailing whitespace, and finally takes `&self.source[start..self.pos - 1]`. The end index is one byte before the current position — which is inside the whitespace gap, not at the token boundary — so the returned slice is one character short. If `self.pos` happened to equal `start` (empty source) the subtraction would underflow and panic in debug mode.

**Fix:** Move the leading-whitespace skip to before `start` is recorded, and change the slice to `&self.source[start..self.pos]` (the CHANGE 2 line). `self.pos` after the inner loop already sits at the first whitespace byte or end-of-string, which is exactly the correct exclusive end for the token slice.

**Explanation:** A half-open range `[start, end)` in Rust means the byte at `end` is not included. After the non-whitespace loop, `self.pos` is one past the last byte of the token — that is the correct exclusive end. The old code then ran a second loop to consume whitespace, moving `self.pos` further, and subtracted 1 to compensate, but that subtraction now lands inside whitespace rather than at the token boundary. Restructuring so that whitespace is consumed before recording `start`, and stopping immediately after the token characters, makes the arithmetic straightforward and avoids any underflow edge case.
