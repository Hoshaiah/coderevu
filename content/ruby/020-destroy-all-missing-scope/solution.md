## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — destroy_all Deletes All Records
# ------------------------------------------------------------------------

class SessionCleanupJob < ApplicationJob
  queue_as :maintenance

  def perform(tenant_id)
    # CHANGE 1: removed the orphaned `Session.where(tenant_id: tenant_id).destroy_all` line that deleted all sessions for the tenant regardless of expiry.
    # CHANGE 2: chain the tenant scope onto the expiry scope so only expired sessions belonging to this specific tenant are destroyed.
    expired_scope = Session.where(tenant_id: tenant_id).where(expired_at: ..Time.current)
    expired_scope.destroy_all
  end
end
```

## Explanation

### Issue 1: Tenant-scoped `destroy_all` ignores expiry filter

**Problem:** The line `Session.where(tenant_id: tenant_id).destroy_all` deletes every session that belongs to the given tenant, whether it has expired or not. All active users in that tenant are signed out the moment the job runs.

**Fix:** Remove the standalone `Session.where(tenant_id: tenant_id).destroy_all` call entirely (CHANGE 1). The tenant filter is instead folded into the single chained scope at CHANGE 2.

**Explanation:** In ActiveRecord, `where` returns a relation but does not execute a query. Calling `destroy_all` on that relation immediately fires a `DELETE` (or individual `destroy` calls) against every record matching only those conditions. Because the tenant scope and the expiry scope were on two separate relation objects that were never combined, each `destroy_all` acted independently. The first one wiped all sessions for the tenant, and the second wiped all expired sessions platform-wide. Removing the first call eliminates the unscoped tenant deletion.

---

### Issue 2: Expiry scope is never restricted to the target tenant

**Problem:** `expired_scope` is built from `Session.where(expired_at: ..Time.current)` with no tenant filter, so `expired_scope.destroy_all` deletes expired sessions belonging to every tenant, not just the one passed into the job. In a multi-tenant platform this crosses tenant boundaries on every run.

**Fix:** At CHANGE 2, prepend `.where(tenant_id: tenant_id)` before the expiry condition so the final scope is `Session.where(tenant_id: tenant_id).where(expired_at: ..Time.current)`. Both constraints are now part of the same relation and are combined into a single `WHERE tenant_id = ? AND expired_at <= ?` clause.

**Explanation:** ActiveRecord merges consecutive `where` calls with `AND`, so chaining them produces one relation that must satisfy all conditions simultaneously. When they were separate objects, there was no link between them — `expired_scope` had no knowledge of `tenant_id` at all. A related pitfall: if you ever pass this scope to a method that calls `unscope` or `rewhere`, the tenant filter can be stripped silently, so it is worth adding a test that asserts the generated SQL contains both predicates.
