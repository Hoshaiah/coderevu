## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Nested Permit Strips Address Data
# ------------------------------------------------------------------------

class OrdersController < ApplicationController
  def create
    @order = current_user.orders.build(order_params)
    if @order.save
      redirect_to @order, notice: "Order placed!"
    else
      render :new
    end
  end

  private

  def order_params
    params.require(:order).permit(
      :product_id,
      :quantity,
      :notes,
      # CHANGE 1: permit shipping_address as a nested hash with explicit sub-keys instead of a bare symbol, so Strong Parameters allows the nested attributes through rather than silently discarding them.
      shipping_address: %i[
        name
        street
        city
        state
        zip
        country
      ]
    )
  end
end
```

## Explanation

### Issue 1: Nested Hash Silently Dropped by Strong Parameters

**Problem:** Every order is saved with a blank or default shipping address even though the customer filled in the address form. The correct address appears in request logs but never reaches the database. No error is raised anywhere.

**Fix:** Replace the bare `:shipping_address` symbol with `shipping_address: %i[name street city state zip country]` so Rails treats the value as a permitted nested hash rather than a scalar scalar key. All sub-keys are now explicitly allowlisted.

**Explanation:** `ActionController::Parameters#permit` treats a bare symbol as a scalar allowlist entry. When the incoming params contain `shipping_address` as a hash (e.g., `{name: "Alice", street: "1 Main St", ...}`), Rails sees a hash where it expected a scalar, silently skips the entire key, and returns a filtered params object with `shipping_address` absent. The resulting `order_params` hash has no address data at all, so `build` sets nothing and the model falls back to whatever default (or nil) was already stored. Because `save` still succeeds (address fields are not validated as required), there is no error signal. Passing a hash as the value — `shipping_address: [...sub-keys...]` — tells `permit` that this key should be a nested hash and which of its keys are allowed through. A related pitfall: if you use `accepts_nested_attributes_for` instead of a plain nested hash, you need to permit `shipping_address_attributes:` (with the `_attributes` suffix) rather than `shipping_address:`, or the same silent drop occurs.

---

### Issue 2: Tests Only Assert HTTP Status, Not Persisted Data

**Problem:** Automated tests pass because they only check that the response is a redirect or a 200, not that the saved order record actually contains the submitted address. The bug lived in production for three months without a failing test.

**Fix:** Add assertions (e.g., `assert_equal "1 Main St", Order.last.shipping_address["street"]`) in the controller test after the POST, verifying that each address sub-field is stored on the record. This corresponds to CHANGE 1 indirectly — once the permit call is correct the assertions will pass; before the fix they would catch the regression.

**Explanation:** Strong Parameters discards unpermitted keys without raising an exception in any environment by default (`config.action_controller.action_on_unpermitted_parameters` defaults to `:log` in development and nothing in production). A test that only checks `assert_response :redirect` cannot detect that data was silently stripped. The fix is to assert on the model state after the action — call `Order.last.reload` and verify the nested address fields match what was submitted. This kind of persistence assertion would have caught the bug at the moment the sprint code was written, long before it reached production.
