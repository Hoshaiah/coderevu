## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Cache Key Exposes Tenant Data
# ------------------------------------------------------------------------

class ReportsController < ApplicationController
  before_action :require_login

  def show
    report_type = params[:type]
    # CHANGE 2: Sanitize report_type to prevent slash injection or key collision via crafted type strings; only allow alphanumeric+underscore values.
    sanitized_type = report_type.to_s.gsub(/[^\w]/, '_')
    # CHANGE 1: Include current_user.organization_id in the cache key so users from different tenants with coincidentally equal user IDs never share a cached result.
    cache_key = "reports/#{sanitized_type}/org_#{current_user.organization_id}/user_#{current_user.id}"

    @report_data = Rails.cache.fetch(cache_key, expires_in: 15.minutes) do
      ReportGenerator.run(type: report_type, organization: current_user.organization)
    end

    render json: @report_data
  end
end
```

## Explanation

### Issue 1: Cache Key Missing Tenant Identifier

**Problem:** Two users from different organizations can see each other's report data when the Rails cache is warm. User A from Org 1 loads a report and the result is cached under `reports/income/user_5`. When User B from Org 2 (who also happens to have `id = 5`) loads the same report type, Rails returns the cached result without hitting the database or the authorization layer, serving Org 1's financial data to Org 2's user.

**Fix:** Add `current_user.organization_id` to the cache key, producing `reports/#{sanitized_type}/org_#{current_user.organization_id}/user_#{current_user.id}`. This is the `CHANGE 1` site.

**Explanation:** The authorization check lives inside the `ReportGenerator.run` block, which is the block passed to `Rails.cache.fetch`. When the cache already has a value for the key, `fetch` returns it immediately and never executes the block, so `ReportGenerator.run` — and its organization scope — is never called. Because user IDs are typically assigned from a single auto-incrementing sequence, user 5 in Org 1 and user 5 in Org 2 are different people who share the same numeric ID. Including `organization_id` in the key makes each tenant's cache entries independent. A related pitfall: if you ever switch to UUIDs per-tenant rather than a global sequence, collisions become far less likely but are still theoretically possible if UUIDs are generated deterministically; scoping by organization remains the right practice regardless.

---

### Issue 2: Unsanitized User Input in Cache Key

**Problem:** `params[:type]` is inserted directly into the cache key string without any validation. An attacker can supply a value like `../../admin/global` or `income/org_99/user_1` to craft a key that deliberately collides with another tenant's cache entry, bypassing the organization scope added in Issue 1.

**Fix:** Replace the raw `report_type` in the key with `sanitized_type`, produced by `report_type.to_s.gsub(/[^\w]/, '_')`, which strips every character that is not a word character (`[a-zA-Z0-9_]`). This is the `CHANGE 2` site.

**Explanation:** Rails cache keys are just strings; there is no escaping layer between the key you provide and the underlying store (Memcached, Redis, etc.). A slash in a Redis key is valid and meaningful for key-space organization tools, and in Memcached a space or control character in a key causes a protocol error that can silently fall back to a cache miss, causing unexpected behavior. By normalizing the type to word characters only, you prevent both deliberate key-collision attacks and accidental breakage from unexpected input. Note that `sanitized_type` is used only in the cache key; the original `report_type` is still passed to `ReportGenerator.run`, which should perform its own validation on acceptable report types.
