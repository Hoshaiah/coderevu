## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Thread-Local State Leaks Between Requests
# ------------------------------------------------------------------------

module Middleware
  class CurrentTenant
    def initialize(app)
      @app = app
    end

    def call(env)
      request = Rack::Request.new(env)
      subdomain = request.host.split('.').first
      tenant = Tenant.find_by(subdomain: subdomain)

      # CHANGE 2: Raise early when subdomain does not resolve to a known tenant, preventing nil from being stored and used by downstream scopes.
      raise TenantNotFound, "Unknown subdomain: #{subdomain}" if tenant.nil?

      RequestStore.store[:current_tenant] = tenant
      @app.call(env)
    ensure
      # CHANGE 1: Always clear the tenant from the store after each request so a reused thread does not leak state into the next request.
      # CHANGE 3: This runs even when find_by raises, preventing a stale tenant from a failed request from persisting on the thread.
      RequestStore.store[:current_tenant] = nil
    end
  end
end

module Current
  def self.tenant
    RequestStore.store[:current_tenant]
  end
end
```

## Explanation

### Issue 1: Thread-local state not cleared between requests

**Problem:** Puma reuses threads across requests. When a request finishes, the previous tenant stays in `RequestStore.store[:current_tenant]`. If the next request on that thread hits an error before setting the tenant — or sets it too late — ActiveRecord scopes read the stale value and query against the wrong `tenant_id`. Operators see data from a different tenant in responses.

**Fix:** The `ensure` block, which previously had a "Intentionally left blank" comment, now sets `RequestStore.store[:current_tenant] = nil` (labeled `CHANGE 1`). This runs unconditionally after every request, regardless of success or failure.

**Explanation:** Ruby's `ensure` clause runs even when an exception is raised, making it the correct place to put teardown logic. `RequestStore` is backed by `Thread.current`, so each Puma thread has its own slot. Without clearing it, the slot retains whatever value was written by the last request that ran on that thread. Under load, threads are reused within milliseconds, so a request for `tenant-b` can finish and the same thread immediately starts serving a request for `tenant-a` — but if the new request fails to overwrite the slot before the first DB query fires, `tenant-b`'s id appears in the `WHERE` clause. The nil assignment in `ensure` closes that window entirely.

---

### Issue 2: Nil tenant stored silently on unrecognized subdomain

**Problem:** When `Tenant.find_by` returns `nil` (subdomain not in the database), the middleware stores `nil` without raising an error. Downstream code that calls `Current.tenant` receives `nil`, and any scope that does `where(tenant_id: Current.tenant&.id)` silently omits the filter or returns all rows, exposing every tenant's data to whoever hit the unrecognized subdomain.

**Fix:** A guard clause `raise TenantNotFound, "Unknown subdomain: #{subdomain}" if tenant.nil?` is added immediately after `find_by` (labeled `CHANGE 2`). This prevents `nil` from ever reaching the store.

**Explanation:** Storing a sentinel value like `nil` and expecting every consumer to handle it safely is fragile — it only takes one scope that skips the nil check to expose data. Raising an exception instead means the request fails fast with a clear error that can be rescued at a higher layer (e.g., to render a 404 page), rather than silently proceeding with no tenant context. The `ensure` block (CHANGE 1) still runs and clears the store even when this exception is raised, so there is no secondary leak.

---

### Issue 3: Exception during tenant lookup leaves stale tenant in store

**Problem:** If `Tenant.find_by` raises (database timeout, connection error, etc.), the `ensure` block did nothing, so the thread's store slot still holds the tenant from a previous request. The next request on that thread inherits it and queries against the wrong tenant without any indication that something went wrong.

**Fix:** The same `RequestStore.store[:current_tenant] = nil` in the `ensure` block (labeled `CHANGE 3`) also covers this case — `ensure` runs whether the exception originated from `find_by`, from the CHANGE 2 raise, or from anywhere inside `@app.call(env)`.

**Explanation:** Ruby's `ensure` clause runs for every exit path: normal return, explicit `raise`, and uncaught exceptions propagating up the call stack. The original developer's comment "assumed GC would handle cleanup" is incorrect — GC reclaims memory for objects, but it does not reset `Thread.current`-backed storage, which lives as long as the thread lives. Puma threads survive for the entire lifetime of the worker process. Clearing the slot in `ensure` is the only mechanism that guarantees a clean slate for the next request regardless of how the current one ends.
