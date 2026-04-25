## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — ActiveRecord Enum String Comparison
# ------------------------------------------------------------------------

class Order < ApplicationRecord
  enum status: { pending: 0, processing: 1, shipped: 2, delivered: 3, cancelled: 4 }

  # CHANGE 2: Replace string "pending" with symbol :pending so ActiveRecord enum translates it to the integer 0 in the WHERE clause.
  scope :overdue, -> { where(status: :pending).where("created_at < ?", 3.days.ago) }
end

# app/controllers/admin/orders_controller.rb
class Admin::OrdersController < ApplicationController
  def index
    @orders = if params[:status].present?
                # CHANGE 1: Use params[:status].to_sym so the value is passed as a symbol and ActiveRecord enum mapping converts it to the correct integer; a raw string stopped working in Rails 6.1.
                Order.where(status: params[:status].to_sym)
              else
                Order.all
              end
    # CHANGE 1: Same fix — replace string "pending" with symbol :pending for the pending count query.
    @pending_count = Order.where(status: :pending).count
  end
end
```

## Explanation

### Issue 1: String argument breaks enum `where` lookup

**Problem:** The admin "pending orders" queue always returns zero results and `@pending_count` is always 0, even though the database has rows with `status = 0`. Filtering by any status from the UI produces an empty list.

**Fix:** Replace `where(status: "pending")` with `where(status: :pending)` (a symbol), and change `params[:status].to_sym` so the controller passes a symbol into the same clause rather than a raw string. The same symbol fix is applied to `@pending_count`.

**Explanation:** ActiveRecord's `enum` stores values as integers in the database (`pending` → `0`). When you call `where(status: :pending)`, ActiveRecord recognises the symbol as an enum key and translates it to `WHERE status = 0`. When you pass a string `"pending"`, Rails 6.1 changed how enum coercion works: it no longer silently maps the string to the integer, so the query becomes `WHERE status = 'pending'` (or an unmatched cast), which matches no integer rows. This is why the feature broke after the 5.2 → 6.1 upgrade without any change to the filter logic itself. Using `.to_sym` on `params[:status]` is safe here because the enum definition acts as an allowlist — passing an unrecognised symbol raises `ArgumentError`, which is actually better than silently returning no rows.

---

### Issue 2: `overdue` scope uses string literal for enum value

**Problem:** Any call to `Order.overdue` returns no rows in Rails 6.1+, even when overdue pending orders exist in the database. The scope appears to work (no error is raised) but the result set is always empty.

**Fix:** Change `where(status: "pending")` to `where(status: :pending)` inside the `overdue` scope definition.

**Explanation:** This is the same root cause as Issue 1 but in the model's scope. The scope was written with a string at some point — likely because string and symbol both worked interchangeably in Rails 5.x enum handling — and the Rails 6.1 change broke both places simultaneously. Because the scope chains an additional `where` clause on `created_at`, the broken status condition silently filters out all rows before the date check even runs, making the bug harder to notice in logs. Switching to a symbol ensures the enum mapping fires and the generated SQL reads `WHERE status = 0 AND created_at < ?`.
