## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — CSRF Protection Skipped on Action
# ------------------------------------------------------------------------

# app/controllers/transfers_controller.rb
class TransfersController < ApplicationController
  # CHANGE 1: Removed `skip_before_action :verify_authenticity_token, only: [:create]` — restoring Rails default CSRF verification so forged cross-site POST requests are rejected with a 422 instead of executed.

  before_action :authenticate_user!

  def new
    @transfer = Transfer.new
    @accounts = current_user.accounts
  end

  def create
    @transfer = current_user.transfers.build(transfer_params)
    if @transfer.save
      redirect_to accounts_path, notice: "Transfer initiated."
    else
      render :new
    end
  end

  private

  def transfer_params
    params.require(:transfer).permit(:from_account_id, :to_account_id, :amount_cents)
  end
end
```

## Explanation

### Issue 1: CSRF Token Verification Disabled on Sensitive Action

**Problem:** Any website can embed a form that POSTs to `/transfers` while the victim's browser automatically sends their session cookie. Because `verify_authenticity_token` is skipped for `create`, Rails never checks whether the request originated from the app's own form, so the transfer executes as if the user submitted it themselves.

**Fix:** Remove the `skip_before_action :verify_authenticity_token, only: [:create]` line entirely (CHANGE 1). `ApplicationController` already inherits Rails' default `protect_from_forgery with: :exception`, so deleting the skip line is all that is needed.

**Explanation:** Rails CSRF protection works by embedding a per-session token in every form via `form_authenticity_token` and then verifying that token on every non-GET request. A cross-site attacker cannot read that token from another origin due to the browser's same-origin policy, so their forged form will not include a valid token. When the skip was added for the API prototype, mobile clients were sending their own `Authorization` header tokens instead of cookies, so the CSRF check was irrelevant there. After the migration to session-based auth, the skip became a vulnerability: the session cookie is sent automatically by the browser on cross-origin POSTs (especially with `SameSite=Lax`, which does not block top-level form submissions). A related pitfall: `SameSite=Strict` would block those form submissions, but relying on a cookie attribute alone is not a substitute for server-side token verification, because older browsers and some redirect flows can bypass `Lax` restrictions.

---

### Issue 2: Unnecessary Opt-Out Creates Invisible Future Risk

**Problem:** Keeping a `skip_before_action` scoped to a specific action makes the protection model non-obvious. A developer adding a new state-mutating action to this controller in the future might copy the existing pattern or assume the skip is intentional, silently shipping another unprotected endpoint.

**Fix:** The same CHANGE 1 deletion resolves this: with no `skip_before_action` present, the controller's protection model is identical to every other controller in the app and requires no extra annotations to stay safe.

**Explanation:** Rails' default is secure — protection is on unless explicitly turned off. Explicit opt-outs are fine when justified (e.g., a webhook receiver that authenticates via HMAC signature), but they should be accompanied by a comment explaining the rationale and the compensating control. Without that, the skip looks like inherited boilerplate rather than a deliberate architectural decision. Removing the line entirely means the controller's behavior is governed entirely by `ApplicationController`, making audits and code reviews easier: a reviewer never has to wonder whether a `skip_before_action` is still warranted.
