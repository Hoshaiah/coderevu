## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Session Fixation on Login
# ------------------------------------------------------------------------

class SessionsController < ApplicationController
  # CHANGE 2: Removed skip_before_action for :create — CSRF protection must stay enabled on login to prevent cross-site login attacks.

  def create
    user = User.find_by(email: params[:email])

    if user&.authenticate(params[:password])
      # CHANGE 1: Call reset_session before writing any user identity into the session; this issues a brand-new session ID, invalidating any pre-set cookie an attacker planted.
      reset_session
      session[:user_id] = user.id
      redirect_to dashboard_path, notice: "Welcome back!"
    else
      flash.now[:alert] = "Invalid email or password."
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    # CHANGE 3: Replace session.delete(:user_id) with reset_session so the entire session is wiped and a new ID is issued, preventing session reuse after logout.
    reset_session
    redirect_to root_path
  end
end
```

## Explanation

### Issue 1: Session Fixation on Login

**Problem:** After a successful login, the code writes `user.id` into the existing session without rotating the session ID. An attacker who has already planted a known session cookie in the victim's browser (via subdomain XSS, a shared network, etc.) will find that same cookie is now authenticated once the victim logs in.

**Fix:** Call `reset_session` immediately before assigning `session[:user_id]` in the success branch. `reset_session` discards all existing session data and forces Rails to generate a fresh session ID for the response cookie.

**Explanation:** `CookieStore` signs the cookie to prevent tampering, but signing does not change the session ID itself. The attacker does not need to forge or tamper — they already know the ID because they set it. After the victim authenticates, that same known ID becomes a valid authenticated session. Calling `reset_session` breaks the attack because the cookie the attacker holds is no longer the active session; Rails has issued an entirely new one. Place the call before any writes so no data from the old session leaks into the new one. A related pitfall: if you copy individual keys from the old session to the new one (e.g., to preserve a return URL), copy only the fields you explicitly trust, never the whole session hash.

---

### Issue 2: CSRF Protection Disabled on Login

**Problem:** `skip_before_action :verify_authenticity_token, only: :create` turns off Rails' CSRF check for the login POST. An attacker can craft a page that submits login credentials (their own) to your app from any origin, potentially logging the victim into the attacker's account (login CSRF), which can then be used to harvest the victim's activity.

**Fix:** Remove the `skip_before_action` line entirely. Rails' default `CookieStore` session already provides the CSRF token storage that `protect_from_forgery` needs, so no extra configuration is required.

**Explanation:** The CSRF token ties a form submission to the browser session that received the form. Without it, any site can POST to `SessionsController#create`. The common justification for skipping it — "it's just a login form" — misses the login CSRF scenario where the attacker authenticates the victim as a known account, then observes actions the victim takes while unknowingly logged in as the attacker. Keeping CSRF protection on for login costs nothing because the login form is rendered by your own app and already receives the token via `form_authenticity_token` in the view.

---

### Issue 3: Incomplete Session Teardown on Logout

**Problem:** `session.delete(:user_id)` removes only the `user_id` key but leaves the session ID and any other session data untouched. If an attacker obtained the session cookie before logout (e.g., via network capture), they can probe whether that cookie still works or exploit leftover session data.

**Fix:** Replace `session.delete(:user_id)` with `reset_session`, which clears all session data and rotates the session ID in one call, just as is done on login.

**Explanation:** A session that survives logout with the same ID is a standing invitation for session replay. If an attacker recorded a valid session cookie, `session.delete` does not invalidate it server-side for `CookieStore` (since there is no server-side store to invalidate), but rotating the ID means the attacker's recorded cookie no longer matches the new ID the server expects on subsequent requests. Additionally, leaving other session keys in place after logout can expose data (e.g., a stored return URL or CSRF token) to whoever holds the old cookie. `reset_session` is the safest single call because it handles both concerns atomically.
