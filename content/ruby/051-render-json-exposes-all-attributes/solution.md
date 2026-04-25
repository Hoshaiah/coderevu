## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — render json: Leaks Sensitive Attributes
# ------------------------------------------------------------------------

module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate_user!

      # CHANGE 2: Restrict access to the current user's own record only, preventing horizontal privilege escalation.
      before_action :authorize_own_record!

      def show
        user = User.find(params[:id])
        # CHANGE 1: Pass only safe attributes as a plain hash so no sensitive fields are ever serialized.
        render json: user.as_json(only: [:id, :name, :email, :created_at, :updated_at])
      end

      def update
        user = User.find(params[:id])
        if user.update(user_params)
          # CHANGE 1: Same safe attribute allowlist applied to the update response.
          render json: user.as_json(only: [:id, :name, :email, :created_at, :updated_at])
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def user_params
        params.require(:user).permit(:name, :email)
      end

      # CHANGE 2: Halt the request with 403 if the authenticated user is not the requested record's owner.
      def authorize_own_record!
        unless current_user.id == params[:id].to_i
          render json: { error: 'Forbidden' }, status: :forbidden
        end
      end
    end
  end
end
```

## Explanation

### Issue 1: Sensitive Fields Leak via render json:

**Problem:** Calling `render json: user` on an ActiveRecord model serializes every column in the `users` table by default. Any client that receives the response — or any proxy that logs it — sees `password_digest`, `reset_password_token`, and `stripe_customer_id` in plaintext JSON.

**Fix:** Replace `render json: user` (in both `show` and `update`) with `render json: user.as_json(only: [:id, :name, :email, :created_at, :updated_at])`, which produces a plain Hash containing only those named keys before serialization.

**Explanation:** Rails' `render json:` calls `to_json` on whatever object you give it. For an ActiveRecord instance, `to_json` iterates over `attributes`, which is every column the database returned. There is no default opt-out mechanism for sensitive columns at the controller layer, so they all appear unless you explicitly restrict them. Using `as_json(only: [...])` builds a Ruby Hash of just the listed attributes before serialization happens, so the excluded columns never enter the JSON string. A common pitfall is relying on `attr_accessor` or model-level `as_json` overrides that only some serializers respect — defining the allowlist explicitly at the render call is the safest, most readable approach and makes the contract visible to the next engineer who reads the controller.

---

### Issue 2: Missing Authorization Allows Cross-User Access

**Problem:** Both `show` and `update` look up users by `params[:id]` without checking whether the authenticated user owns that record. Any logged-in user can pass someone else's numeric ID in the URL and read or overwrite that person's profile data.

**Fix:** Add a `before_action :authorize_own_record!` filter and a private method that compares `current_user.id` to `params[:id].to_i`, rendering a 403 `Forbidden` response and halting the chain when they differ.

**Explanation:** Devise's `authenticate_user!` only verifies that a valid session or token exists — it says nothing about which resource the token holder is allowed to touch. Because `User.find(params[:id])` trusts whatever integer the client supplies, an attacker who is authenticated as user 42 can request `/api/v1/users/7` and receive user 7's data (or overwrite their name and email). The `before_action` guard runs before any database lookup, so the request is rejected immediately without ever loading the target record. The `.to_i` conversion on `params[:id]` is necessary because params values are strings; comparing the string `"7"` to the integer `42` with `==` would always return false in Ruby, meaning the guard would never block anything. Scoping lookups to `current_user` directly (e.g., `current_user` rather than `User.find(params[:id])`) is an alternative pattern that is even harder to bypass, but the explicit check here is equally correct and keeps the controller pattern consistent.
