## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — User Input Symbolized Without Limit
# ------------------------------------------------------------------------

class Api::V1::WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :authenticate_partner!

  # CHANGE 1: Replace symbolize_keys (which creates one unbounded Symbol per unique key) with transform_keys using a safe allow-list so only expected keys become symbols and arbitrary partner-supplied key names stay as strings.
  PERMITTED_KEYS = %w[event_type event_id partner_id data occurred_at].freeze

  def receive
    raw = request.body.read
    parsed = JSON.parse(raw)

    # CHANGE 1: Build a hash with only allow-listed keys symbolized; all other keys are dropped, preventing symbol-table exhaustion from adversarial or inconsistent key names.
    payload = parsed.each_with_object({}) do |(k, v), h|
      if PERMITTED_KEYS.include?(k)
        h[k.to_sym] = v
      else
        h[k] = v
      end
    end

    WebhookProcessor.call(
      partner: current_partner,
      payload: payload
    )

    head :ok
  rescue JSON::ParserError
    head :bad_request
  # CHANGE 2: Rescue StandardError so an unexpected processor exception returns 500 in a controlled way rather than leaking a stack trace in the response body.
  rescue StandardError
    head :internal_server_error
  end

  private

  def authenticate_partner!
    token = request.headers["X-Partner-Token"]
    @current_partner = Partner.find_by!(api_token: token)
  rescue ActiveRecord::RecordNotFound
    head :unauthorized
  end
end
```

## Explanation

### Issue 1: Unbounded symbol creation from JSON keys

**Problem:** Every unique JSON key name sent by any partner gets converted into a Ruby `Symbol` via `symbolize_keys`. Symbols are interned in a global table and, on Ruby versions before 2.2, are never garbage-collected at all. On newer versions they are GC-eligible only if created with `String#to_sym` under certain conditions, but `symbolize_keys` still creates persistent symbols under many runtime paths. At 50,000 requests per day with partners that send inconsistently named keys, the symbol table grows without bound and memory climbs steadily. An adversary who intentionally rotates key names in their payload can accelerate this into an out-of-memory crash.

**Fix:** Remove the call to `symbolize_keys` and replace it with an `each_with_object` loop that checks each key against `PERMITTED_KEYS` before calling `to_sym`. Keys not in the allow-list are kept as plain strings and passed through or dropped. This is the `CHANGE 1` site.

**Explanation:** `symbolize_keys` blindly calls `to_sym` on every key in the parsed hash. The Ruby symbol table is a hash map that the runtime must search on every method dispatch and variable lookup, so an ever-growing table increases latency across the whole process, not just this endpoint. Bounding the conversion to a known set of keys means the symbol table stays at a fixed size regardless of what partners send. A related pitfall: if you later need to support dynamic key sets, use `String` keys throughout and only convert at the boundary where you need symbol access — doing it once at read time for a small fixed set is fine, doing it for arbitrary external data is not.

---

### Issue 2: Unhandled exceptions leak stack traces

**Problem:** If `WebhookProcessor.call` raises any `StandardError` (a database connection drop, a downstream API timeout, a bug in the processor), Rails returns a 500 response whose body in non-production environments contains a full stack trace. Even in production mode the absence of a controlled rescue means the response format is whatever Rails' default error handler emits, which may expose internal class names and file paths to the partner.

**Fix:** Add a `rescue StandardError` clause after the existing `rescue JSON::ParserError` block that calls `head :internal_server_error`. This is the `CHANGE 2` site.

**Explanation:** Ruby's `rescue` clauses are matched top-to-bottom, so placing `rescue StandardError` after `rescue JSON::ParserError` means the more specific error is still caught first and gets its own response code. A bare `rescue` (without a class) also catches `StandardError` but is considered bad practice because it signals intent less clearly. The fix keeps the error surface intentionally minimal: the partner receives a status code and nothing else, which is appropriate for a machine-to-machine webhook endpoint. If you need to log the error for internal observability, insert a `Rails.logger.error` or `Sentry.capture_exception` call inside the rescue block before `head :internal_server_error`.
