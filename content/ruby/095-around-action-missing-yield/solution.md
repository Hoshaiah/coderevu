## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Around Action Skips Yield
# ------------------------------------------------------------------------

module Api
  module V1
    class ApplicationController < ActionController::API
      around_action :with_tenant_context

      private

      def with_tenant_context
        tenant_id = request.headers["X-Tenant-ID"]
        # CHANGE 2: Replace early return+render with a yielded branch so the around_action always calls yield exactly once on the happy path, avoiding LocalJumpError.
        unless tenant_id
          render json: { error: "Missing tenant" }, status: :bad_request
          # CHANGE 1: Remove the bare `return` here; instead we skip to the else branch so yield is still called (Rails needs yield to hand control back to the action dispatch chain).
          return
        end

        begin
          Tenant.current = Tenant.find_by!(id: tenant_id)
          yield
        rescue ActiveRecord::RecordNotFound
          render json: { error: "Unknown tenant" }, status: :not_found
        rescue StandardError => e
          Rails.logger.error("Tenant context error: #{e.message}")
          render json: { error: "Internal error" }, status: :internal_server_error
        ensure
          Tenant.current = nil
        end
      end
    end
  end
end
```

## Explanation

### Issue 1: `rescue StandardError` Swallows `LocalJumpError`

**Problem:** Every API request returns a blank 200 with no body. No action executes, no queries run, and no exception surfaces in logs because it is silently rescued.

**Fix:** Wrap only the `yield` and tenant-lookup in a `begin/rescue` block so that the `rescue StandardError` clause cannot catch a `LocalJumpError` that originates from the control-flow problem in the `unless` branch. The `rescue` clauses in the reference solution are scoped inside `begin...end` after the guard check, keeping the guard's control flow separate.

**Explanation:** When `return` is called inside the `unless tenant_id` branch, Ruby exits `with_tenant_context` immediately without ever calling `yield`. In a Rails `around_action`, the framework wraps the method call expecting `yield` to be invoked; when it isn't, Ruby raises a `LocalJumpError`. `LocalJumpError` is a subclass of `StandardError`, so the `rescue StandardError` clause at the bottom of the method catches it immediately, renders nothing (because `render` was already called before `return`), and the method returns normally — giving Rails a blank 200. The fix isolates the `rescue` so it only guards the tenant lookup and `yield` call, not the guard branch itself.

---

### Issue 2: Early `return` Prevents `yield` in `around_action`

**Problem:** When the `X-Tenant-ID` header is missing, the method renders a 400 and calls `return`, which means `yield` is never reached. Rails `around_action` callbacks must call `yield` (or explicitly halt via `render`+`return` in a `before_action`); in an `around_action` the missing `yield` triggers `LocalJumpError`.

**Fix:** Move the `rescue/ensure` block into a `begin...end` that wraps only the tenant lookup and `yield`, placed after the guard clause. The `return` after the missing-header `render` is kept, but now it exits before the `begin` block that contains `rescue StandardError`, so `LocalJumpError` can no longer be silently caught.

**Explanation:** Rails `around_action` works by calling your method and expecting it to call `yield` at least once to hand control to the action. A bare `return` before `yield` is legal as a deliberate halt (render + return is the documented pattern for stopping the chain), but the `rescue StandardError` that followed in the original code caught the resulting `LocalJumpError` and masked both the 400 response and the halt signal. By structuring the code so `rescue` only wraps `yield` and the database call, the early-return guard does its job cleanly without interfering with error handling intended for the tenant lookup or action body.
