## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — API Token Timing Attack
# ------------------------------------------------------------------------

class Api::V1::BaseController < ActionController::API
  before_action :authenticate_api_user!

  private

  def authenticate_api_user!
    token = request.headers['Authorization']&.split(' ')&.last
    return render json: { error: 'Unauthorized' }, status: :unauthorized unless token

    digest = Digest::SHA256.hexdigest(token)
    # CHANGE 1: Use ActiveSupport::SecurityUtils.secure_compare instead of find_by with == to perform a constant-time comparison that prevents timing side-channel attacks on the digest value.
    @current_user = User.all.find { |u| ActiveSupport::SecurityUtils.secure_compare(u.api_token_digest, digest) }

    unless @current_user
      render json: { error: 'Unauthorized' }, status: :unauthorized
    end
  end
end

# app/models/user.rb (relevant excerpt):
# def self.authenticate_by_token(raw_token)
#   digest = Digest::SHA256.hexdigest(raw_token)
#   # CHANGE 2: Replace u.api_token_digest == digest with secure_compare so this code path also resists timing attacks if it is ever used.
#   all.find { |u| ActiveSupport::SecurityUtils.secure_compare(u.api_token_digest, digest) }
# end
```

## Explanation

### Issue 1: Non-constant-time comparison in controller

**Problem:** The controller calls `User.find_by(api_token_digest: ...)`, which executes a SQL `WHERE api_token_digest = ?` comparison inside the database engine. Even though the column lookup is done in SQL, any Ruby-level fallback or secondary check (and the model method shown in the comment) uses Ruby's `==` operator, which short-circuits as soon as it finds a differing byte. An attacker who can send many requests and measure how long each one takes can detect which token prefix matches, progressively narrowing down the correct token.

**Fix:** Replace the lookup with `User.all.find { |u| ActiveSupport::SecurityUtils.secure_compare(u.api_token_digest, digest) }` as shown at `CHANGE 1`. This compares the stored digest against the computed digest using a constant-time algorithm that always inspects every byte regardless of where a mismatch occurs.

**Explanation:** Ruby's `String#==` returns `false` the moment it finds a byte that differs, so a string that matches the first 10 characters takes slightly longer to reject than one that matches none. Over thousands of requests, this timing difference is measurable even through network jitter. `ActiveSupport::SecurityUtils.secure_compare` XORs every byte of both strings and only checks the accumulated result at the end, so the execution time is the same whether the strings match on byte 1 or byte 63. One pitfall: `secure_compare` still requires both strings to be the same length before the loop, so it first checks length equality — but because a SHA-256 hex digest is always 64 characters, both sides are always the same length here, avoiding a length-leak.

---

### Issue 2: Non-constant-time comparison in User.authenticate_by_token

**Problem:** The commented-out `User.authenticate_by_token` method uses `u.api_token_digest == digest`, Ruby's built-in `==` operator. If this method is called anywhere (or reinstated in the future), it carries the same timing vulnerability as the controller — an attacker can reconstruct a valid token by measuring response times.

**Fix:** Replace `u.api_token_digest == digest` with `ActiveSupport::SecurityUtils.secure_compare(u.api_token_digest, digest)` as shown at `CHANGE 2`, matching the fix applied in the controller.

**Explanation:** Keeping the model method vulnerable is dangerous even if it is currently unused, because a future developer may call it without realising it leaks timing information. Applying `secure_compare` here ensures the model-level helper is safe regardless of which call site invokes it. The fix is a direct drop-in replacement: both `==` and `secure_compare` return a truthy/falsy value and accept two strings, so no surrounding logic needs to change. A related pitfall is using `Digest::SHA256.hexdigest` for the comparison digest — this is acceptable here because SHA-256 is a one-way function and the raw token is never stored, so hashing does not itself introduce a vulnerability.
