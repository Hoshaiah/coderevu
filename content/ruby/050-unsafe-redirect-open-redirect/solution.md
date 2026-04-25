## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Login redirect parameter allows attackers to redirect users to arbitrary external URLs
# ------------------------------------------------------------------------
# app/controllers/sessions_controller.rb
class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  def new
    @return_to = params[:return_to]
  end

  def create
    user = User.find_by(email: params[:email])
    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      raw_return_to = params[:return_to].presence
      # CHANGE 1: Only allow relative (internal) paths; reject anything with a host component. URI.parse can raise on malformed input, so we rescue and fall back to root_path.
      return_to = begin
        uri = URI.parse(raw_return_to.to_s)
        # CHANGE 1: If the URI has a host set it is absolute and may point offsite — discard it.
        (raw_return_to.present? && uri.host.nil?) ? raw_return_to : root_path
      rescue URI::InvalidURIError
        root_path
      end
      redirect_to return_to
    else
      flash.now[:alert] = "Invalid email or password."
      render :new, status: :unauthorized
    end
  end

  private

  # CHANGE 2: Provide a helper so views can call safe_return_to_param instead of embedding params[:return_to] directly, making it harder to accidentally trust raw input.
  def safe_return_to_param(value)
    return nil if value.blank?
    uri = URI.parse(value.to_s)
    uri.host.nil? ? value : nil
  rescue URI::InvalidURIError
    nil
  end
  helper_method :safe_return_to_param
end
```

## Explanation

### Issue 1: Unvalidated open-redirect via `return_to`

**Problem:** After a successful login, the controller calls `redirect_to params[:return_to]` with no checks. An attacker crafts `/login?return_to=https://evil.com`, sends the link to a victim, and after the victim authenticates they land on the attacker's site. Rails' `redirect_to` happily issues a `302` to any string, including fully-qualified external URLs.

**Fix:** Before using `raw_return_to`, parse it with `URI.parse` and check whether `uri.host` is `nil`. A relative path like `/dashboard` has no host, so it passes. An absolute URL like `https://evil.com` has a host, so the code discards it and falls back to `root_path`. A rescue block catches malformed URI strings and also falls back to `root_path`.

**Explanation:** The root cause is that `redirect_to` in Rails accepts any string and will follow it. The app intended to support only internal paths (e.g. `/orders/5`), but nothing prevented a caller from supplying a full URL. Parsing with `URI.parse` and gating on `uri.host.nil?` is a reliable way to distinguish relative paths from absolute URLs because RFC-3986-compliant absolute URLs must carry an authority (host) component. One pitfall: an attacker may try protocol-relative URLs like `//evil.com/path`, which `URI.parse` will set a host on, so the check catches those too. Another pitfall is `URI::InvalidURIError` on inputs containing spaces or unusual bytes — the rescue ensures those never reach `redirect_to`.

---

### Issue 2: Raw `return_to` input surfaced through the view without a safety wrapper

**Problem:** The `new` action assigns `@return_to = params[:return_to]` and views typically render it verbatim in a hidden field (`value="<%= @return_to %>"`). This means the unvalidated external URL is preserved through the form POST, carrying the unsafe value into `create` even if an attacker submits the form manually. There is also a secondary risk of reflected XSS if the view ever renders the value outside an attribute context without escaping.

**Fix:** A private `safe_return_to_param` helper method is added and exposed to views via `helper_method`. It applies the same `URI.parse` / `uri.host.nil?` guard and returns `nil` for unsafe values. Views should call `safe_return_to_param(params[:return_to])` instead of using `params[:return_to]` or `@return_to` directly.

**Explanation:** Storing attacker-supplied data in an instance variable and piping it into a hidden form field keeps the malicious URL alive across the GET→POST round-trip. Even if `create` were hardened, a developer who later adds a hidden field using `@return_to` reintroduces the bug. Centralising the validation in a named helper makes the safe path the obvious path, and the `nil` return value means a blank hidden field rather than an attacker URL. Rails' ERB auto-escaping does prevent HTML injection in attribute values, but it does not prevent a valid-looking absolute URL from being submitted and acted upon.
