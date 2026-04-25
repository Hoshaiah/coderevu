## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — User Input in Log Format String
# ------------------------------------------------------------------------

class SearchController < ApplicationController
  def index
    @query = params[:q].to_s.strip
    @results = Product.search(@query)

    # CHANGE 1: Use plain string interpolation instead of `%` formatting so that @query is treated as literal data and cannot be misinterpreted as a format directive; also escapes embedded newlines to prevent log-line injection.
    # CHANGE 2: Replace `%d` with direct interpolation of `current_user.id` to avoid ArgumentError when the ID is a UUID string or nil.
    Rails.logger.info("[Search] user=#{current_user.id} query=#{@query.gsub(/[\r\n]+/, ' ')}")

    render :index
  end
end
```

## Explanation

### Issue 1: Log Injection via Format-String Operator

**Problem:** The `%` operator treats its right-hand arguments as data *and* the left-hand string as a format template, but it has no special role to play here — the real risk is that `@query` comes directly from `params[:q]` with no sanitisation. A query containing a newline character (`\n`) lets an attacker append a completely fabricated log line, such as `[Auth] user=1 logged_in=true`, making it appear as a genuine log entry from another component. Log-aggregation systems that parse structured formats (JSON, logfmt) may drop or misparse real lines that follow the injected content.

**Fix:** Replace the `%` format call with Ruby string interpolation and add `.gsub(/[\r\n]+/, ' ')` on `@query` at the `CHANGE 1` site. The interpolated string treats every value as literal text, and stripping carriage-return and newline characters removes the injection vector.

**Explanation:** Ruby's `%` operator is modelled on C's `printf`. When the format string is a constant and the values are programmer-controlled, it is safe. When a value is user-supplied and that value ends up *inside* the format string itself (not the value slot), arbitrary format directives can cause memory reads or crashes in C — Ruby does not have that exact problem, but the newline-injection path is real and language-agnostic. String interpolation in Ruby calls `.to_s` on each expression and concatenates the result as raw characters, so there are no format directives to exploit. The `.gsub` call ensures that even after interpolation a query like `"shoes\n[Auth] admin=true"` becomes `"shoes [Auth] admin=true"` on a single log line, which any log parser will attribute to the Search component rather than treating as a separate event.

---

### Issue 2: Wrong Format Specifier Causes Runtime Error

**Problem:** The format specifier `%d` coerces its argument through Ruby's `Integer()` conversion. If `current_user.id` is a UUID string (common with PostgreSQL `uuid` primary keys) or `nil` (unauthenticated request that somehow reaches this action), Ruby raises `ArgumentError: invalid value for Integer()` or `TypeError`, and the request ends with a 500 error before the page renders. The log line intended for analytics instead causes an outage symptom.

**Fix:** At the `CHANGE 2` site, remove the `%d` specifier entirely and embed `current_user.id` directly via `#{current_user.id}`, which calls `.to_s` on whatever type the ID actually is — integer, UUID string, or any other value — without type coercion.

**Explanation:** `%d` is inherited from C's `printf` semantics and demands an integer. Ruby's `String#%` enforces this by calling `Integer(value)`, which raises rather than silently truncating or converting non-integer input. Direct interpolation calls `.to_s`, which is defined on every Ruby object, so it degrades gracefully: an integer prints as `"42"`, a UUID prints as `"550e8400-e29b-41d4-a716-446655440000"`, and `nil` prints as `""`. The fix also makes the code forward-compatible if the primary-key type changes in a future migration.
