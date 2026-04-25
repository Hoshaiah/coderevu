## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Mutation of Frozen Constant Array
# ------------------------------------------------------------------------

# frozen_string_literal: true

module Config
  ALLOWED_ROLES = ["admin", "editor", "viewer"].freeze

  # CHANGE 1: Return a new array instead of mutating the frozen constant; this avoids FrozenError and keeps ALLOWED_ROLES intact.
  def self.grant_temporary_role(role)
    ALLOWED_ROLES + [role]
  end

  # CHANGE 2: Accept an optional extra_roles array so callers can check against a temporary set without touching the constant.
  def self.allowed?(role, extra_roles: [])
    ALLOWED_ROLES.include?(role) || extra_roles.include?(role)
  end
end

# Called during an OAuth callback when a partner SSO grants extra roles:
# CHANGE 1 & 2: Store the expanded list locally and pass it to allowed? rather than mutating the shared constant.
expanded_roles = Config.grant_temporary_role("partner_read")
Config.allowed?("partner_read", extra_roles: expanded_roles)
```

## Explanation

### Issue 1: Mutation of Frozen Constant Array

**Problem:** Any call to `Config.grant_temporary_role` pushes a new element into `ALLOWED_ROLES` with `<<`, but the array is frozen via `.freeze`. Ruby raises `FrozenError: can't modify frozen Array` the moment `<<` is executed. In production this surfaces intermittently because the OAuth callback path is not hit on every request, and the error appears deep in middleware rather than at the obvious call site.

**Fix:** Replace the `<<` mutation in `grant_temporary_role` with `ALLOWED_ROLES + [role]`, which returns a brand-new array and leaves the frozen constant untouched.

**Explanation:** Calling `.freeze` on an object makes that specific object immutable — any attempt to change it in place (via `<<`, `push`, `delete`, etc.) raises `FrozenError`. The `frozen_string_literal: true` magic comment only freezes string literals in the file; it has no effect on arrays or other objects. Because `ALLOWED_ROLES` is a module-level constant shared across all threads and requests on a given process, the frozen protection is intentional — it prevents accidental cross-request state leaks. The fix uses `+` to produce a new, unfrozen array containing the temporary role, which the caller can inspect or pass around without ever touching the constant.

---

### Issue 2: Global State Leak from Temporary Role Grant

**Problem:** Even if the array were not frozen, appending a role to `ALLOWED_ROLES` affects every subsequent `allowed?` check on that process for the rest of its lifetime. A role granted to one OAuth session becomes permanently visible to all users on that dyno, which is a privilege-escalation bug. This is why the errors (and, silently, the leaked access) appear only after the app has been running for a while.

**Fix:** `grant_temporary_role` now returns a new local array instead of modifying the constant, and `allowed?` gains an `extra_roles:` keyword argument so callers can pass the temporary set in without it being stored anywhere shared.

**Explanation:** A Ruby constant is just a reference to an object. Freezing the object protects its contents, but before this change nothing stopped code from replacing or mutating it. The right mental model for a constant like `ALLOWED_ROLES` is that it represents a fixed policy baked in at boot time. Anything dynamic — like a role granted per OAuth session — belongs in request-scoped state (a local variable, a session value, a per-request context object), not in a constant. The updated `allowed?` signature makes the boundary explicit: stable roles live in the constant, request-specific roles are passed in as an argument and discarded when the call returns. A related pitfall is caching the expanded array in a class-level instance variable, which would recreate the same leak in a less obvious form.
