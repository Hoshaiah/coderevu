## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — argparse Default List Shared Across Calls
# ------------------------------------------------------------------------

import argparse

DEFAULT_TARGETS = ["unit", "integration"]

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Internal task runner")
    parser.add_argument(
        "--targets",
        nargs="+",
        # CHANGE 1: pass a fresh copy of DEFAULT_TARGETS each call so mutations to args.targets never bleed back into the shared module-level list.
        default=list(DEFAULT_TARGETS),
        help="Test suites to run",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        default=False,
    )
    return parser

def run(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    # CHANGE 2: copy the parsed list before callers mutate it, preventing any remaining alias through argparse internals from affecting the stored default.
    args.targets = list(args.targets)
    # Caller may mutate args.targets, e.g. args.targets.append("smoke")
    print("Running targets:", args.targets)
```

## Explanation

### Issue 1: Shared mutable default list

**Problem:** `DEFAULT_TARGETS` is a single list object defined at module level. Every call to `build_parser()` passes that same object as the `default=` value. When a caller does `args.targets.append("smoke")`, it mutates the list that argparse still holds as the recorded default. The next call to `build_parser()` passes the already-mutated list, so tests that rely on the default see `["unit", "integration", "smoke"]` instead of the original two entries.

**Fix:** Replace `default=DEFAULT_TARGETS` with `default=list(DEFAULT_TARGETS)` at the `add_argument` call site (CHANGE 1). This creates a new list on every `build_parser()` invocation, so mutations to any one parsed result cannot affect future parsers.

**Explanation:** Python does not copy objects when you pass them as arguments — `default=DEFAULT_TARGETS` stores a reference to the exact same list object. argparse records that reference internally and hands it back verbatim when the argument is absent from `argv`. Because `args.targets` is then that same object, any in-place mutation (`append`, `extend`, `pop`) writes to `DEFAULT_TARGETS` itself. Calling `build_parser()` again does not help because the constructor runs `default=DEFAULT_TARGETS` again, which just re-reads the already-mutated module-level name. Wrapping with `list(...)` produces a fresh shallow copy each time the function runs, breaking the alias.

---

### Issue 2: args.targets still aliases the default after parsing

**Problem:** Even with CHANGE 1 in place, argparse sets `args.targets` to the exact list object it received as `default=`. If no `--targets` flag is given on the command line, `args.targets` is the same object that was passed to `add_argument`, not a further copy. A caller that mutates `args.targets` would still corrupt that particular parser's stored default, which matters if `parse_args` is called more than once on the same parser instance.

**Fix:** After `parse_args`, add `args.targets = list(args.targets)` (CHANGE 2) so the caller always holds an independent copy regardless of whether the value came from the default or from the command line.

**Explanation:** When argparse uses a default value it does not copy it — `namespace.targets` is set to the exact object passed as `default=`. If the same `parser` object calls `parse_args` a second time (common in REPL or test scenarios that reuse a parser), the internal default is still the list from the first `add_argument` call, and the first call's mutation is visible. Explicitly copying at the point of use (right after `parse_args`) ensures the `Namespace` object owns its own list with no live aliases back into argparse state. A related pitfall: the same problem affects any other mutable default type — dicts, sets, custom objects — not just lists.
