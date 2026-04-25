---
slug: dataclass-mutable-field-shared
track: python
orderIndex: 44
title: Shared Mutable Default in Dataclass
difficulty: easy
tags:
  - correctness
  - api-misuse
  - dataclasses
language: python
---

## Context

This module is in `models/pipeline.py` and defines the configuration object for a data-processing pipeline. Each pipeline run creates a fresh `PipelineConfig` instance and may append stage names to `completed_stages` as stages finish. Results are aggregated at the end of the run.

The QA team noticed that after running several pipelines in sequence within the same process (in integration tests and in the production batch runner), `completed_stages` from earlier runs bleeds into later runs. A pipeline that should start with no completed stages instead sees stages from the previous run already in the list.

The bug does not appear when the process is restarted between runs, which led the team to initially suspect a database caching issue before they isolated it to this in-memory object.

## Buggy code

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class PipelineConfig:
    name: str
    max_workers: int = 4
    completed_stages: list[str] = []
    failed: bool = False
    error_message: Optional[str] = None

def run_pipeline(config: PipelineConfig) -> None:
    for stage in ["extract", "transform", "load"]:
        # ... run stage ...
        config.completed_stages.append(stage)
```
