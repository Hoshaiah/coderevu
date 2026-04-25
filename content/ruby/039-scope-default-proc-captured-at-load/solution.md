## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Default Scope Time Frozen at Boot
# ------------------------------------------------------------------------

class AuditLog < ApplicationRecord
  # CHANGE 1: Removed default_scope with a static time value. default_scope evaluates its block once at class load, so 90.days.ago is computed at boot and never updated. A named scope re-evaluates the lambda on every call, keeping the cutoff accurate.
  # CHANGE 2: Replaced default_scope with an explicit named scope so callers opt in deliberately, preventing accidental guardrail bypass or confusion when the scope is merged with other queries.
  scope :recent, -> { where('created_at >= ?', 90.days.ago) }

  belongs_to :user
  belongs_to :resource, polymorphic: true
end

# Callers must now opt in explicitly:
# AuditLog.recent.where(user: current_user)   # last-90-days filter applied
# AuditLog.recent.count                        # likewise
```

## Explanation

### Issue 1: Scope Timestamp Frozen at Boot

**Problem:** After the application has been running for weeks, `AuditLog.count` and similar queries silently include records older than 90 days. The cutoff date is the boot date minus 90 days, not today minus 90 days, so the window expands indefinitely the longer the server runs without a restart.

**Fix:** Remove `default_scope` entirely and replace it with `scope :recent, -> { where('created_at >= ?', 90.days.ago) }`. The stabby-lambda `->` body is evaluated each time `.recent` is called, so `90.days.ago` is computed fresh on every query.

**Explanation:** Ruby evaluates the block passed to `default_scope` exactly once, at class-load time (typically during application boot). The result of `90.days.ago` at that moment is stored as a fixed `Time` value. Every subsequent query uses that frozen timestamp, not the current time. A named scope declared with `-> { ... }` is a `Proc` that Rails calls each time the scope is invoked, so `90.days.ago` is re-evaluated on every query and always reflects the real current time. A related pitfall: if you use `scope :recent, where(...)` without a lambda, you hit the same freeze because the `where` is evaluated immediately at class load.

---

### Issue 2: Silent Guardrail Applied via Default Scope

**Problem:** Because the filter is a `default_scope`, all queries against `AuditLog` silently include it. Callers writing `AuditLog.where(user: current_user)` may not realise the time window is being applied, and when they need historical data they must remember to call `.unscoped`, which strips all default scopes including associations and other conditions — a footgun.

**Fix:** Replace `default_scope` with the explicit named scope `scope :recent`. Callers that want the 90-day guardrail write `AuditLog.recent.where(...)`. Callers that legitimately need historical data just omit `.recent` without touching unrelated scopes.

**Explanation:** `default_scope` merges its conditions into every query automatically, including those triggered through associations (`user.audit_logs`). When a developer needs to query outside the window they must call `.unscoped`, which removes every default scope on the model — including any ordering or soft-delete scopes — which is usually not the intent. A named scope is opt-in: the guardrail is just as easy to apply (`AuditLog.recent`) but does not silently affect queries where the caller has no idea a filter exists. This makes the intent visible in code review and prevents surprising results when the application logic genuinely requires access to older records.
