## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Tar Extract Allows Path Traversal
# ------------------------------------------------------------------------

import tarfile
import os

def _safe_members(tf: tarfile.TarFile, staging_dir: str):
    # CHANGE 1: Resolve the staging directory to an absolute real path so all comparisons are against a canonical base.
    resolved_base = os.path.realpath(staging_dir)
    for member in tf.getmembers():
        # CHANGE 2: Skip symlinks and hardlinks entirely — they can point outside the staging dir and are not needed for build artifacts.
        if member.issym() or member.islnk():
            print(f"Skipping link member: {member.name}")
            continue
        # CHANGE 1 (continued): Resolve what the member's destination path would be and reject anything that escapes the staging directory.
        member_target = os.path.realpath(os.path.join(resolved_base, member.name))
        if not member_target.startswith(resolved_base + os.sep) and member_target != resolved_base:
            print(f"Skipping unsafe member: {member.name}")
            continue
        yield member

def unpack_artifact(archive_path: str, staging_dir: str) -> None:
    """
    Extract a build artifact tar.gz into the given staging directory.
    """
    os.makedirs(staging_dir, exist_ok=True)
    with tarfile.open(archive_path, "r:gz") as tf:
        # CHANGE 3: Pass only the vetted members from _safe_members instead of calling extractall with no filter, preventing path traversal via any member type.
        tf.extractall(path=staging_dir, members=_safe_members(tf, staging_dir))
    print(f"Extracted artifact to {staging_dir}")

def run_validation(job_id: str, archive_path: str) -> None:
    staging_dir = f"/tmp/staging/{job_id}"
    unpack_artifact(archive_path, staging_dir)
    # ... run validation steps ...
```

## Explanation

### Issue 1: Path traversal via `../` or absolute member names

**Problem:** A tar archive can contain members named like `../../etc/cron.d/evil` or `/tmp/staging/other_tenant/file`. When `tf.extractall(path=staging_dir)` processes these, it writes the file to the path the member name resolves to, ignoring `staging_dir` as a boundary. Ops sees files appearing in `/tmp/` or in other tenants' staging directories with no error raised.

**Fix:** The `_safe_members` generator calls `os.path.realpath` on both `staging_dir` and the joined `staging_dir + member.name`. Any member whose resolved destination does not start with `resolved_base + os.sep` is skipped and logged. The vetted generator is passed to `tf.extractall` via the `members` argument (CHANGE 1 and CHANGE 3).

**Explanation:** `tarfile.extractall` trusts member names completely. A name starting with `/` is treated as absolute, and a name containing `../` walks up the directory tree relative to `staging_dir`. `os.path.realpath` collapses all `..` components and resolves symlinks in the path, giving a canonical absolute path. Comparing that canonical path against the canonical base directory catches both `../` sequences and absolute names. Note the check appends `os.sep` before calling `startswith` to prevent a staging dir like `/tmp/staging/123` from falsely accepting `/tmp/staging/1234/evil`.

---

### Issue 2: Symlink and hardlink members can escape the staging directory

**Problem:** A tar member can be a symlink whose target points to `/tmp/staging/other_tenant/` and then a subsequent member extracts a file into that symlink, effectively writing outside the staging directory even if the symlink member's own name appears safe. The canonical-path check alone does not help because the symlink member itself may resolve to a path inside the staging dir at extraction time.

**Fix:** The `_safe_members` generator calls `member.issym()` and `member.islnk()` and skips any member that returns `True`, logging the skipped name (CHANGE 2). Build artifact archives do not need symlinks or hardlinks for validation purposes, so discarding them has no functional cost.

**Explanation:** Symlinks introduce a two-step escape: first the symlink is created inside the staging directory, then a file is written through it. Because the file-write step uses the symlink as a directory component, it lands wherever the symlink points — potentially outside the staging directory. Hardlinks can similarly alias files outside the tree. Checking the resolved path of the symlink member itself is insufficient because the target may not exist yet at check time and could be created by the attacker later. Refusing to extract any link type is the minimal, reliable fix.

---

### Issue 3: `extractall` with no `members` filter silently honors all member attributes

**Problem:** Calling `tf.extractall(path=staging_dir)` with no `members` argument passes every member in the archive to the extraction engine. Python's `tarfile` module does not warn or error on dangerous members by default (prior to the `filter` parameter added in 3.12). The worker sees no exceptions and logs a success message while files have already been written to unintended locations.

**Fix:** Replace the bare `tf.extractall(path=staging_dir)` call with `tf.extractall(path=staging_dir, members=_safe_members(tf, staging_dir))`, threading all members through the validation generator before extraction (CHANGE 3).

**Explanation:** The `members` parameter of `extractall` accepts any iterable of `TarInfo` objects and extracts only those. By making `_safe_members` a generator that yields only vetted members, every member is inspected before `tarfile` touches the filesystem. This is preferable to extracting all members first and then cleaning up, because dangerous files may have already had an effect (e.g., triggering a watcher, overwriting a file) before cleanup runs. Python 3.12 introduced an explicit `filter` parameter as a more structured alternative, but the `members` iterable approach works on all supported Python versions.
