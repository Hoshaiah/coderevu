---
slug: deepcopy-in-hot-loop
track: python
orderIndex: 95
title: Unnecessary deepcopy in Tight Loop
difficulty: hard
tags:
  - perf
  - correctness
  - data-structures
language: python
---

## Context

This function is in `engine/rule_evaluator.py`. It evaluates a list of rules against each incoming event in a stream-processing pipeline. Each rule is a dict read from a database at startup; the evaluator must not mutate the original rule definitions because they are shared across concurrent worker threads.

A performance review flagged this function as the single biggest CPU consumer in the pipeline, accounting for 60% of total CPU time during load tests. Flame graphs show almost all that time is spent in `copy.deepcopy`. The rules dicts are nested (they contain lists of condition dicts), but the evaluation logic itself is read-only — it never mutates any part of the rule.

The team introduced `deepcopy` several months ago after a bug where a rule was mutated during evaluation. That bug has since been fixed in the evaluation logic itself, but the defensive copy was never removed.

## Buggy code

```python
import copy
from typing import Any

RULES: list[dict] = []  # loaded once at startup, never mutated after load

def evaluate_event(event: dict[str, Any]) -> list[str]:
    """Return the names of all rules that match the event."""
    matched = []
    for rule in RULES:
        rule_copy = copy.deepcopy(rule)   # defensive copy
        if _matches(rule_copy, event):
            matched.append(rule_copy["name"])
    return matched

def _matches(rule: dict, event: dict[str, Any]) -> bool:
    for condition in rule["conditions"]:
        field = condition["field"]
        expected = condition["value"]
        if event.get(field) != expected:
            return False
    return True
```
