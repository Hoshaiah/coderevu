## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Thread-Local State Bleeds Between Requests
# ------------------------------------------------------------------------

import threading

_local = threading.local()

def set_current_user(user):
    # CHANGE 2: write to the thread-local object so each thread has its own isolated copy of the user
    _local.current_user = user

def get_current_user():
    # CHANGE 2: read from thread-local storage; return None if this thread has never set a user
    return getattr(_local, 'current_user', None)

def clear_current_user():
    # CHANGE 1: was using `global _current_user` and reassigning the module-level variable, which is both shared and was never actually written by set_current_user
    # CHANGE 2: delete the attribute from the thread-local object so cleanup is also per-thread
    _local.current_user = None
```

## Explanation

### Issue 1: `set_current_user` Silently Discards the Value

**Problem:** Calling `set_current_user(user)` has no lasting effect. The user object is stored in a local function variable and dropped the moment the function returns. Every call to `get_current_user()` returns `None` or whatever stale value the module-level `_current_user` happened to hold.

**Fix:** Remove the bare assignment `_current_user = user` inside `set_current_user` and replace it with `_local.current_user = user`, which writes to the thread-local object that persists beyond the function call.

**Explanation:** In Python, assigning to a name inside a function always creates a local variable unless the name is declared `global` (or `nonlocal`). The original `set_current_user` never declared `global _current_user`, so the line `_current_user = user` created a new local variable, shadowing the module-level name without touching it. The function returned, the local variable was garbage-collected, and the module-level `_current_user` was never updated. `get_current_user()` therefore always read the unchanged module-level value. The fix sidesteps the `global` declaration entirely by using the already-instantiated `_local` object, whose attributes survive across function calls and are naturally scoped to the thread.

---

### Issue 2: User State Stored in a Shared Module-Level Variable Instead of Thread-Local Storage

**Problem:** Even if the `global` keyword had been present, `_current_user` is a single module-level variable shared by every thread in the process. Under Gunicorn's threaded sync worker, multiple requests execute simultaneously in different threads. Thread A sets `_current_user` to user Alice, then Thread B sets it to user Bob. When Thread A subsequently calls `get_current_user()` it receives Bob. This is the data-bleed users are reporting: documents get saved under the wrong account.

**Fix:** Replace every read and write of the module-level `_current_user` with attribute access on `_local` — specifically `_local.current_user`. Use `getattr(_local, 'current_user', None)` in `get_current_user()` to handle threads that have never set a value.

**Explanation:** `threading.local()` creates an object whose attributes are stored in a per-thread namespace. Thread A setting `_local.current_user = alice` does not affect the value Thread B sees when it reads `_local.current_user`. The module already instantiated `_local = threading.local()` at the top, but none of the three functions ever used it. Moving all state into `_local` means each thread carries its own isolated copy from `set_current_user` through `get_current_user` to `clear_current_user`. One related pitfall: thread pools reuse threads across requests, so `clear_current_user()` must be called in a teardown hook (e.g., Flask's `teardown_request`) to prevent a recycled thread from exposing the previous request's user to the next one.
