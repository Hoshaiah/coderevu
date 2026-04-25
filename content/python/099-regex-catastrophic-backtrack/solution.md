## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Nested quantifiers in validation regex cause exponential backtracking on crafted input
# ------------------------------------------------------------------------
import re

# CHANGE 1: Rewrite the pattern to use a non-backtracking atomic structure. The new pattern matches one token, then zero or more hyphen-prefixed tokens, with a mandatory end anchor — no nested quantifiers that can overlap.
REFERENCE_CODE_RE = re.compile(r"^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$")  # CHANGE 1: eliminates nested quantifiers; CHANGE 2: hyphen must be followed by at least one alphanumeric character

def validate_reference_code(code: str) -> bool:
    """Return True if code matches the expected reference format."""
    if len(code) > 64:
        return False
    return bool(REFERENCE_CODE_RE.match(code))


# Example that previously triggered catastrophic backtracking:
# validate_reference_code("AAAAAAAAAAAAAAAAAAAAAAAAA!")
```

## Explanation

### Issue 1: Nested quantifiers cause exponential backtracking

**Problem:** The original pattern `([a-zA-Z0-9]+[-]?)+` puts a `+` quantifier around a group that itself contains a `+` quantifier. When the regex engine tries to match a string like `AAAAAAAAAAAAAAAAAAAAAAAAA!` and the overall match fails, the engine explores an exponentially large number of ways to partition the `A` characters between the outer and inner quantifiers. On a 25-character string this causes the validation worker to hang for tens of seconds at 100% CPU.

**Fix:** Replace `([a-zA-Z0-9]+[-]?)+` with `[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*`. The new pattern has no nested quantifiers: a single `+` covers the first token, and `*` repeats a fixed-structure group `(?:-[a-zA-Z0-9]+)` that cannot overlap with the outer match.

**Explanation:** The backtracking explosion happens because the engine cannot determine which quantifier "owns" each character without trying every combination. With the original pattern and 25 `A`s followed by `!`, the engine tries splitting the 25 characters across the inner `+` and the outer `+` in every possible way before concluding the string does not match — that is 2^25 combinations in the worst case. The rewritten pattern is linear: it reads one token greedily, then looks for literal hyphens followed by another token. A hyphen is a fixed anchor that removes all ambiguity, so backtracking never fans out exponentially. Python's `re` module does not support possessive quantifiers or atomic groups in older versions, so restructuring the pattern itself is the correct fix.

---

### Issue 2: Pattern permits trailing hyphen

**Problem:** The original quantifier `[-]?` makes the hyphen optional, so strings like `ABC-` or `ABC-123-` pass validation. The intended format is tokens separated by hyphens, meaning a hyphen must always have an alphanumeric token on both sides.

**Fix:** The replacement group `(?:-[a-zA-Z0-9]+)` requires at least one alphanumeric character after every hyphen. A bare trailing hyphen produces zero matches of the group and the `$` anchor fails the string.

**Explanation:** With `[-]?` inside a repeated group, the hyphen can appear at the very end of the string and still satisfy the pattern because `?` makes it optional and the group can match a final iteration that is just `[a-zA-Z0-9]+` with a trailing optional hyphen consumed. The rewritten structure `[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*` ties each hyphen to a mandatory following token, so `ABC-` reaches `$` after the trailing hyphen with no remaining token, causing the match to fail as expected.
