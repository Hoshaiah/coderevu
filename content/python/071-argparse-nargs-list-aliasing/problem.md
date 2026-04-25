---
slug: argparse-nargs-list-aliasing
track: python
orderIndex: 71
title: argparse Default List Shared Across Calls
difficulty: medium
tags:
  - correctness
  - cli
  - mutable-defaults
language: python
---

## Context

`cli/runner.py` is the entry point for an internal task-runner CLI. The `build_parser` function is called once at startup, but in the test suite it is called fresh for each test case that needs a parser. The test suite also exercises default argument handling.

Testers noticed that if a test appends to `args.targets` after parsing, subsequent tests that rely on the default value of `--targets` see the mutated list from the previous test, even though `build_parser()` is called again. In production (where `build_parser` is called only once) this doesn't surface, but it corrupts test isolation and has caused confusing CI failures.

The team checked that `build_parser()` truly creates a new `ArgumentParser` on each call. The leak is subtler — it's in how argparse stores the default.

## Buggy code

```python
import argparse

DEFAULT_TARGETS = ["unit", "integration"]

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Internal task runner")
    parser.add_argument(
        "--targets",
        nargs="+",
        default=DEFAULT_TARGETS,
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
    # Caller may mutate args.targets, e.g. args.targets.append("smoke")
    print("Running targets:", args.targets)
```
