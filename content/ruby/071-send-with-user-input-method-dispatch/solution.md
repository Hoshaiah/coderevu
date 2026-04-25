## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Arbitrary Method Dispatch via User Input
# ------------------------------------------------------------------------

class ReportsController < ApplicationController
  before_action :require_login

  ALLOWED_SORTS = %w[created_at revenue user_count].freeze

  def index
    # CHANGE 1 & 2: Validate sort_by against ALLOWED_SORTS before use; fall back to "created_at" if the value is absent or not permitted, so arbitrary method names are never passed to send.
    sort_by = ALLOWED_SORTS.include?(params[:sort_by]) ? params[:sort_by] : "created_at"
    @reports = Report.all.sort_by { |r| r.send(sort_by) }
    render json: @reports
  end
end
```

## Explanation

### Issue 1: Arbitrary method dispatch via `send`

**Problem:** Any string the caller supplies as `sort_by` is forwarded to `r.send(sort_by)` without validation. A caller sending `sort_by=destroy_all` causes Ruby to invoke `Report#destroy_all` on every loaded record. Sending `sort_by=connection` returns the raw database connection object, leaking internals.

**Fix:** The assignment line is replaced with a guarded expression: `ALLOWED_SORTS.include?(params[:sort_by]) ? params[:sort_by] : "created_at"`. Only values present in the allowlist reach `send`.

**Explanation:** `Object#send` bypasses Ruby's normal public/private visibility and accepts any method name as a string, so an attacker's string becomes a real method call. The guard compares the incoming param against `ALLOWED_SORTS` before any dispatch happens. If the value is not in the list — whether it is a destructive method name, an empty string, or a SQL injection attempt — it is discarded and the safe default `"created_at"` is used instead. A related pitfall: using `public_send` instead of `send` would block private methods but still expose every public method on `Report`, so `public_send` alone is not a sufficient fix here.

---

### Issue 2: Defined allowlist is never enforced

**Problem:** `ALLOWED_SORTS` is declared at the top of the class, which gives the appearance of a security control, but the original code never references it when assigning `sort_by`. The constant is dead code, so the allowlist provides no protection at runtime.

**Fix:** The guard `ALLOWED_SORTS.include?(params[:sort_by])` in the new assignment line is the first (and only) place `ALLOWED_SORTS` is actually read, making the constant do the job it was meant to do.

**Explanation:** Declaring a constant is not the same as using it. In the buggy version, `sort_by` is assigned directly from `params[:sort_by]` without consulting `ALLOWED_SORTS`, so the constant has zero effect on execution. Wiring the include-check into the assignment ensures every code path through `index` produces a value that was explicitly approved. If a developer later wants to add a new sortable column, they add it to `ALLOWED_SORTS` in one place, and the enforcement updates automatically.
