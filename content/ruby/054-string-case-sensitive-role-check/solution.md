## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Case-Sensitive Role Authorization Check
# ------------------------------------------------------------------------

# app/controllers/admin/dashboard_controller.rb
module Admin
  class DashboardController < ApplicationController
    before_action :require_admin!

    def index
      @stats = AdminStats.generate
    end

    private

    def require_admin!
      # CHANGE 1: Downcase the role before comparing so 'Admin', 'ADMIN', and 'admin' all pass the check.
      # CHANGE 2: Add explicit nil guard on current_user before chaining, making the authorization intent unambiguous.
      unless current_user && current_user.role.to_s.downcase == "admin"
        flash[:alert] = "Not authorized."
        redirect_to root_path
      end
    end
  end
end
```

## Explanation

### Issue 1: Case-Sensitive Role Comparison

**Problem:** The check `current_user&.role == "admin"` only passes when the `role` column contains exactly the lowercase string `"admin"`. Users whose `role` is `"Admin"` or `"ADMIN"` — which legacy admin scripts write — are denied access even though they are legitimate admins. Conversely, a test account manually set to `"Admin"` is also blocked, which is the symptom the security team observed.

**Fix:** Replace `current_user&.role == "admin"` with `current_user.role.to_s.downcase == "admin"` (as part of the combined guard). Calling `.to_s.downcase` normalizes any capitalization before the equality check.

**Explanation:** Ruby's `==` on strings is byte-for-byte case-sensitive, so `"Admin" == "admin"` is `false`. Because the PostgreSQL `role` column is a plain `string` with no database-level normalization, whatever casing the inserting script used is exactly what Rails reads back. Calling `.downcase` on the retrieved value before comparing collapses all variants to lowercase, so `"ADMIN"`, `"Admin"`, and `"admin"` all match `"admin"`. Using `.to_s` first ensures a `nil` role doesn't raise `NoMethodError` on `.downcase`. If you control the write path, normalizing on write (e.g., a `before_save` callback or a database check constraint) is an additional safeguard, but the read-side downcase is necessary as long as legacy data exists.

---

### Issue 2: Fragile Nil Safety via Safe-Navigation Operator

**Problem:** `current_user&.role == "admin"` uses safe-navigation (`&.`) to avoid a `NoMethodError` when `current_user` is `nil`. However, when `current_user` is `nil`, the entire expression `current_user&.role` evaluates to `nil`, and `nil == "admin"` is `false`, so `unless false` lets the `redirect_to` fire — that part works. But the intent is obscured, and adding `.downcase` to the chain (`current_user&.role&.downcase == "admin"`) requires a second `&.`, which is easy to forget. This creates a maintenance trap where a future edit might drop one `&.` and cause a `NoMethodError` for unauthenticated requests.

**Fix:** Replace the single `&.` chain with an explicit `current_user &&` check followed by `current_user.role.to_s.downcase == "admin"`. This separates the nil guard from the role comparison and removes the dependency on chained safe-navigation.

**Explanation:** Safe-navigation is convenient for short one-off calls, but when you need to chain multiple method calls (`role`, then `downcase`) the `&.` operators must be applied at every step where `nil` is possible, making the line grow and become harder to audit at a glance. Splitting into `current_user && current_user.role.to_s.downcase == "admin"` means the nil check is explicit and the role normalization is a plain method chain on a guaranteed non-nil object. The `&&` short-circuits, so `current_user.role` is never called when `current_user` is `nil`. Using `.to_s` on `role` adds a secondary nil guard for the case where a user record exists but has no role set, converting `nil` to `""` before `.downcase` runs, preventing a `NoMethodError` in that edge case.
