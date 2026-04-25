## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Redirect Trusts Referer Header
# ------------------------------------------------------------------------

class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  def new
  end

  def create
    user = User.find_by(email: params[:email])
    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      redirect_to after_login_path
    else
      flash.now[:alert] = "Invalid credentials"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session.delete(:user_id)
    session.delete(:return_to)
    redirect_to login_path, notice: "Signed out"
  end

  private

  # CHANGE 1: Removed request.referer fallback entirely — the Referer header is attacker-controlled and must never be trusted as a redirect destination.
  # CHANGE 2: Added safe_internal_path to validate any candidate URL is relative/same-host before using it, preventing open redirect via a crafted session value.
  def after_login_path
    safe_internal_path(session.delete(:return_to)) || root_path
  end

  def safe_internal_path(candidate)
    return nil if candidate.blank?
    uri = URI.parse(candidate)
    # Allow only paths (no host component), guarding against protocol-relative and absolute URLs.
    uri.host.nil? ? candidate : nil
  rescue URI::InvalidURIError
    nil
  end
end
```

## Explanation

### Issue 1: Unvalidated Referer Header Open Redirect

**Problem:** After a successful login, the app redirects the user to `request.referer` when no `return_to` session key is present. An attacker crafts a link like `https://yourapp.com/login` with the `Referer` header (or via a page on their domain that links to login) pointing to `https://evil.com`. After the victim logs in, they land on the attacker's credential-harvesting clone.

**Fix:** Remove `request.referer` from `after_login_path` entirely (CHANGE 1). The fallback is now just `root_path`, which is always safe.

**Explanation:** The HTTP `Referer` header is sent by the browser and reflects the page the user came from, but it can be set arbitrarily by an attacker who controls any page that links to the login URL, or by tools like `curl`. Rails does not validate it. When the code calls `redirect_to request.referer`, Rails happily issues a `302` to whatever string is in that header, including `https://evil.com`. Removing the fallback to `referer` closes the vector completely. The legitimate use case — returning users to a deep link — is still handled by the `session[:return_to]` key, which the app should set before redirecting to login.

---

### Issue 2: Unvalidated Session return_to Enables Stored Open Redirect

**Problem:** The `session[:return_to]` value is used as a redirect destination without checking whether it points to the same application. If an attacker can influence that session key (for example, by manipulating a `redirect_to` parameter that the app stores into the session), they can store an absolute URL like `https://evil.com` or a protocol-relative URL like `//evil.com/phish` and the victim is redirected there on login.

**Fix:** Introduce `safe_internal_path` (CHANGE 2), which parses the candidate URL with `URI.parse` and returns `nil` if a `host` component is present. Only a bare path like `/dashboard` or `/orders/42` — where `uri.host` is `nil` — is accepted as a redirect target.

**Explanation:** Rails' `redirect_to` accepts a plain string and issues a `Location` header with that exact value. A string such as `https://evil.com` is a perfectly valid argument and produces a redirect to an external site. Browsers follow it without question. By parsing the candidate with `URI` and rejecting anything that resolves to an external host, the app ensures it only redirects within its own origin. Protocol-relative URLs like `//evil.com` also carry a host component, so `uri.host` returns `"evil.com"` and they are rejected too. An `URI::InvalidURIError` is rescued and treated as `nil` to avoid any edge-case crash on malformed strings.
