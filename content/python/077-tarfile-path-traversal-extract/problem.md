---
slug: tarfile-path-traversal-extract
track: python
orderIndex: 77
title: Tar Extract Allows Path Traversal
difficulty: medium
tags:
  - correctness
  - security
  - file-handling
language: python
---

## Context

This utility function lives in `workers/artifact_unpacker.py` and is invoked by a CI/CD worker that unpacks build artifacts uploaded by users before running validation steps. Artifacts arrive as `.tar.gz` files and are extracted into an isolated staging directory like `/tmp/staging/<job_id>/`. The worker runs as a low-privilege user but on a shared host alongside other tenants.

Ops has noticed that occasionally files appear outside the intended staging directory after extraction — for example, in `/tmp/` directly or even overwriting files in other tenants' staging directories. No errors are raised and the job continues as if nothing happened. The issue is intermittent and only affects archives uploaded by a small number of users.

The team initially suspected a race condition between jobs but found no evidence in the scheduler logs. The staging directories are created fresh per job and removed afterward. The real problem is in how the archive contents are extracted.

## Buggy code

```python
import tarfile
import os

def unpack_artifact(archive_path: str, staging_dir: str) -> None:
    """
    Extract a build artifact tar.gz into the given staging directory.
    """
    os.makedirs(staging_dir, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tf:
        tf.extractall(path=staging_dir)
    print(f"Extracted artifact to {staging_dir}")

def run_validation(job_id: str, archive_path: str) -> None:
    staging_dir = f"/tmp/staging/{job_id}"
    unpack_artifact(archive_path, staging_dir)
    # ... run validation steps ...
```
