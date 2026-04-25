## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Mass Assignment via Unpermitted Params
# ------------------------------------------------------------------------

class UsersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user

  def update
    # CHANGE 2: Extract permitted params into a private strong-parameter method following Rails convention, making the whitelist the single authoritative place and harder to accidentally bypass.
    if @user.update(user_params)
      render json: { status: :ok }
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_user
    # CHANGE 1: Scope the lookup to the currently authenticated user's own record so no user can manipulate another user's data by crafting a different :id in the URL.
    @user = User.find_by!(id: params[:id], id: current_user.id)
    # CHANGE 1: Simpler and more idiomatic — always resolve to the current user, ignoring the :id param entirely, which is correct for a self-service profile endpoint.
    @user = current_user
  end

  def user_params
    params.require(:user).permit(:name, :email, :bio)
  end
end
```

## Explanation

### Issue 1: Missing authorization / horizontal privilege escalation

**Problem:** `set_user` calls `User.find(params[:id])`, which looks up any user in the database using the `id` value the client supplies. An authenticated user can change `params[:id]` to another user's ID and update that user's record. Because the strong-parameters whitelist is the only guard, and it permits `name`, `email`, and `bio`, any account's profile fields are fully writable by any other authenticated user.

**Fix:** Replace `User.find(params[:id])` with `@user = current_user` at the `CHANGE 1` site, so `set_user` always resolves to the signed-in user's own record regardless of the URL parameter.

**Explanation:** Rails does not automatically tie `params[:id]` to the session; it is just a URL segment. When you call `User.find(params[:id])`, ActiveRecord runs `SELECT * FROM users WHERE id = ?` with whatever value the client sent — there is no implicit ownership check. Swapping to `current_user` (provided by Devise or your auth layer) returns the record tied to the active session token, which the client cannot forge. This also eliminates the original mass-assignment escalation path for `admin` and `account_id`: even if an attacker removed the strong-parameters whitelist, they could only modify their own record. A related pitfall is scoping by tenant: in a multi-tenant app, also verify `current_user.account_id` matches the target resource on every other model lookup, not just users.

---

### Issue 2: Inline strong parameters instead of private method

**Problem:** `safe_params` is defined directly inside `update` rather than in a dedicated private method. This is not a security hole by itself, but it means the whitelist lives in the action body where it can be copy-pasted inconsistently, silently overridden with a local variable, or missed entirely when adding a second action that also accepts user input.

**Fix:** Remove the inline `safe_params` local variable and add a private `user_params` method that calls `params.require(:user).permit(:name, :email, :bio)`, then call `user_params` inside `update` at the `CHANGE 2` site.

**Explanation:** Rails strong-parameters convention puts the permitted-attributes list in a private method so there is exactly one definition to audit, test, and update. When the whitelist is inline, a developer adding a `create` action might write a separate inline block with a slightly different set of permitted fields — now two lists must be kept in sync, and a drift between them is easy to miss in code review. Using `params.require(:user)` instead of `params[:user]` also adds a hard failure if the `user` key is absent entirely, preventing accidental assignment of `nil` to all attributes when a malformed request omits the wrapper key.
