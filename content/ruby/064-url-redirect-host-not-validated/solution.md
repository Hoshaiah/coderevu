## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Open Redirect Without Host Check
# ------------------------------------------------------------------------

class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  SAFE_REDIRECT_PATHS = %w[/dashboard /profile /orders /settings].freeze

  def new
    # CHANGE 2: validate that return_to is a relative (internal) path before storing it, blocking attacker-planted external URLs.
    if params[:return_to].present? && safe_internal_path?(params[:return_to])
      session[:return_to] = params[:return_to]
    end
  end

  def create
    user = User.find_by(email: params[:email])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      return_url = session.delete(:return_to) || root_path

      # CHANGE 1: use safe_internal_path? instead of exact SAFE_REDIRECT_PATHS.include?, so paths with query strings like /orders?page=2 are accepted while external URLs are still rejected.
      if safe_internal_path?(return_url)
        redirect_to return_url
      else
        redirect_to root_path
      end
    else
      flash.now[:error] = "Invalid email or password"
      render :new, status: :unprocessable_entity
    end
  end

  private

  # CHANGE 1+2: centralized helper that parses the URL and checks that it has no host (relative path) and that its leading path segment is in the allowlist.
  def safe_internal_path?(url)
    return false if url.blank?
    uri = URI.parse(url)
    # Reject anything with a host or scheme — those are absolute (possibly external) URLs.
    return false if uri.host.present? || uri.scheme.present?
    # Confirm the path component starts with one of the allowed prefixes.
    SAFE_REDIRECT_PATHS.any? { |allowed| uri.path == allowed || uri.path.start_with?("#{allowed}/", "#{allowed}?") }
  rescue URI::InvalidURIError
    false
  end
end
```

## Explanation

### Issue 1: Allowlist Breaks Legitimate Query-String Paths

**Problem:** `SAFE_REDIRECT_PATHS.include?(return_url)` does a full string equality check. A stored value like `/orders?page=2` does not equal `/orders`, so the controller falls back to `root_path` and silently discards where the user was headed. Meanwhile a value like `/orders/123` is also dropped, even though `/orders` is supposed to be an allowed prefix.

**Fix:** Replace the `SAFE_REDIRECT_PATHS.include?` check in `create` (and the new `new` action guard) with a call to the new `safe_internal_path?` helper. That helper parses the URL with `URI.parse`, rejects anything with a `host` or `scheme`, and then checks whether `uri.path` equals or starts with an allowed prefix, so `/orders?page=2` and `/orders/123` both pass while `https://evil.com` is rejected.

**Explanation:** `String#include?` treats the stored string as an opaque value, so any suffix or query string makes it not match. An attacker does not benefit from this bug directly (the fall-through goes to `root_path`), but legitimate users lose their intended destination every time they arrive at the login page with a URL that carries query parameters. Parsing with `URI.parse` separates the path from the query and fragment before the comparison, which is the correct level of abstraction. The `start_with?` check on the path segment (not the whole string) correctly handles sub-paths like `/orders/456`. The `rescue URI::InvalidURIError` guard prevents a malformed input from raising an unhandled exception.

---

### Issue 2: Unvalidated `return_to` Stored in Session During `new`

**Problem:** The `new` action writes `params[:return_to]` directly into `session[:return_to]` with no check. An attacker sends a victim a link like `https://myapp.com/login?return_to=https://evil.com/fake-login`. The session now holds the external URL before any authentication happens. After a successful login the value is read back out and — in the original code — passed to `redirect_to`, which Rails follows even to external hosts when the value is already in the session.

**Fix:** Wrap the assignment in `new` with the same `safe_internal_path?` guard added for Issue 1. The line becomes `if params[:return_to].present? && safe_internal_path?(params[:return_to])`, so only relative paths whose leading segment is in the allowlist are ever written to the session.

**Explanation:** Session storage gives the value an air of legitimacy — it was stored server-side, not read from a request parameter at redirect time — so developers often trust it implicitly. But the session was still populated from attacker-controlled input. The original developer tried to address this by switching from `redirect_to session[:return_to]` directly to the allowlist check in `create`, but they left the `new` action writing any value. Because `safe_internal_path?` rejects anything with a `host` or `scheme` before it even touches the allowlist, an absolute URL like `https://evil.com` is blocked at the earliest possible point rather than relying on a later gate that might be bypassed or forgotten in a future refactor.
