## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Shared Mutable Default in Dataclass
# ------------------------------------------------------------------------

from dataclasses import dataclass, field
from typing import Optional

@dataclass
class PipelineConfig:
    name: str
    max_workers: int = 4
    # CHANGE 1: Use `field(default_factory=list)` so each instance gets its own fresh list instead of sharing one mutable object across all instances.
    completed_stages: list[str] = field(default_factory=list)
    failed: bool = False
    error_message: Optional[str] = None

def run_pipeline(config: PipelineConfig) -> None:
    for stage in ["extract", "transform", "load"]:
        # ... run stage ...
        config.completed_stages.append(stage)
```

## Explanation

### Issue 1: Shared Mutable Default List

**Problem:** Every `PipelineConfig` instance that relies on the default value for `completed_stages` points to the exact same list object. When one pipeline run appends stage names to it, those names are already present when the next run creates a new `PipelineConfig` and reads `completed_stages`. Operators see stages from run N appearing as already-completed at the start of run N+1.

**Fix:** Replace `completed_stages: list[str] = []` with `completed_stages: list[str] = field(default_factory=list)`. The `field(default_factory=list)` call from the `dataclasses` module instructs Python to call `list()` fresh for each new instance.

**Explanation:** Python evaluates default argument expressions once, at class-definition time, not each time an instance is created. So `[]` in the class body produces a single list object that is stored as the class-level default. Every instance that doesn't supply its own value for `completed_stages` ends up referencing that one shared list. Appending to it via any instance mutates the shared object. `field(default_factory=list)` tells the dataclass machinery to invoke `list()` during `__init__` for each new instance, producing an independent list every time. A related pitfall: this same problem occurs with any mutable default — `{}`, custom objects, etc. — not just lists.

---

### Issue 2: Dataclass Rejects Bare Mutable Default

**Problem:** Python's `dataclasses` module explicitly detects mutable defaults like `[]` and raises `ValueError: mutable default <class 'list'> for field completed_stages is not allowed: use default_factory` at import time. The module cannot even be loaded successfully, so any test or production process that imports it will crash immediately.

**Fix:** The same `field(default_factory=list)` change at the `CHANGE 1` site resolves this error entirely, because `field()` is the approved mechanism for mutable defaults in dataclasses.

**Explanation:** The `dataclasses` decorator inspects each field's default value when the class is being defined. If it detects an instance of `list`, `dict`, or `set` used directly as a default, it raises `ValueError` to prevent the shared-state bug described in Issue 1. This guard means the buggy code raises an exception before any pipeline code can run. Switching to `default_factory` satisfies the dataclass machinery and eliminates the shared-state hazard at the same time.
