## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Double Render in Error Branch
# ------------------------------------------------------------------------

class Api::OrdersController < Api::BaseController
  def create
    order = Order.new(order_params)

    if order.save
      # CHANGE 1: Added `return` so execution stops here and does not fall through to the logging line, which would cause Rails to hit a second render-like termination and raise AbstractController::DoubleRenderError.
      return render json: { id: order.id, status: order.status }, status: :created
    else
      # CHANGE 1: Added `return` on the error branch for the same reason — without it execution continues past the render call.
      return render json: { errors: order.errors.full_messages }, status: :unprocessable_entity
    end

  ensure
    # CHANGE 2: Moved logging into an `ensure` block and use order.persisted? to log meaningful state for both success and failure paths instead of always logging errors (which are empty on success).
    if order.persisted?
      Rails.logger.info "Order attempt by user #{current_user.id}: success, order_id=#{order.id}"
    else
      Rails.logger.info "Order attempt by user #{current_user.id}: failed with #{order.errors.full_messages}"
    end
  end

  private

  def order_params
    params.require(:order).permit(:product_id, :quantity, :address)
  end
end
```

## Explanation

### Issue 1: Missing `return` After `render` Causes DoubleRenderError

**Problem:** When order creation fails, the server logs `AbstractController::DoubleRenderError` and the response body is empty or garbled. The developer sees only one `render` call per branch and assumes that is safe, but execution does not stop at `render` — it continues to the lines below the `if/else` block.

**Fix:** Add `return` before each `render` call (e.g., `return render json: ...`) so the method exits immediately after committing the response. This is the `# CHANGE 1` site on both the success and failure branches.

**Explanation:** In Rails, `render` does not halt method execution the way it might look like it does — it schedules the response but the method keeps running. After the `if/else` completes, execution reaches the logging line, which is harmless on its own, but then the method returns normally and Rails checks whether a response was committed. In some middleware or callback configurations this causes Rails to attempt a default template render on top of the already-committed JSON response, raising `AbstractController::DoubleRenderError`. Adding `return` before each `render` ensures the method exits before reaching any post-branch code. A related pitfall: `redirect_to` has the same behavior — it also does not halt execution, so `return redirect_to ...` is the correct pattern there too.

---

### Issue 2: Audit Log Always Reads `errors.full_messages`, Empty on Success

**Problem:** The log line `Rails.logger.info "Order attempt by user #{current_user.id}: #{order.errors.full_messages}"` always interpolates `order.errors.full_messages`. On a successful save, `errors` is empty, so every successful order logs `Order attempt by user 42: []`, which carries no useful information for an audit trail.

**Fix:** Replace the single unconditional log line with a conditional log inside an `ensure` block (the `# CHANGE 2` site) that logs `order.id` on success and `order.errors.full_messages` on failure.

**Explanation:** `order.errors` is populated only when validation fails; after a successful `save` it is an empty `ActiveModel::Errors` collection. The original code checks nothing, so successful orders produce a meaningless log entry and failed orders produce a useful one — exactly backwards from what an audit trail needs. Moving the log to `ensure` guarantees it runs regardless of which branch was taken or whether an exception occurs mid-render. Using `order.persisted?` as the branch condition is reliable: `persisted?` returns `true` only after a successful database insert, so it cleanly separates the two cases.
