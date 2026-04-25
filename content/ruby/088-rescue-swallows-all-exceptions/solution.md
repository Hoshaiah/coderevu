## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Database errors silently vanish and return nil to callers
# ------------------------------------------------------------------------
class UserRepository
  def self.find(id)
    User.find(id)
  # CHANGE 1: Rescue only the specific ActiveRecord exception instead of bare `rescue`, which previously caught every exception including Ruby internals and programming errors.
  rescue ActiveRecord::RecordNotFound => e
    # CHANGE 2: Re-raise a domain-specific error instead of returning nil, so callers get a meaningful exception rather than a nil that causes a silent NoMethodError downstream.
    # CHANGE 3: Include the original message so the cause is traceable in Sentry/logs.
    raise UserRepository::NotFoundError, "User not found: #{e.message}"
  end

  NotFoundError = Class.new(StandardError)
end

# Caller:
# CHANGE 2 (call site): Rescue the domain error explicitly so the failure mode is visible
# and the app can respond with a proper 404 instead of rendering a blank page.
begin
  user = UserRepository.find(params[:id])
  profile = user.profile
rescue UserRepository::NotFoundError => e
  render plain: e.message, status: :not_found
end
```

## Explanation

### Issue 1: Bare `rescue` Catches Everything

**Problem:** The original `rescue` with no exception class catches every `Exception` subclass, including `NoMemoryError`, `LoadError`, and plain programming mistakes like `NameError`. A typo inside `find`, a broken association, or a configuration error all become silent nils. Engineers see nothing in Sentry because the exception is consumed before it ever propagates.

**Fix:** Replace bare `rescue` with `rescue ActiveRecord::RecordNotFound => e` at the `CHANGE 1` site. This narrows the rescue to the one database-level signal that `User.find` raises when a row is missing, letting every other exception propagate normally.

**Explanation:** Ruby's bare `rescue` is equivalent to `rescue StandardError`, which still catches most runtime errors, but in Rails `rescue` at the start of a line without a class actually catches `StandardError` and below. Either way, it is far too broad. A narrowly scoped rescue means only the intended condition is handled. Everything else — a broken database connection, a missing column, a programming bug — will propagate to the framework's error handler and appear in Sentry as expected. One related pitfall: `User.find_by(id: id)` returns `nil` by design and never raises, so if you switch to that method you need a different guard strategy.

---

### Issue 2: Returning nil Hides the Failure Site

**Problem:** When `find` rescues and returns `nil`, the caller assigns `nil` to `user` with no warning. The very next line — `user.profile` — raises `NoMethodError: undefined method 'profile' for nil`. The stack trace points at the caller, not at the repository, making it hard to see what actually went wrong. Pages render blank because a controller `rescue_from NoMethodError` or a high-level rescue may also swallow that secondary error.

**Fix:** At `CHANGE 2`, raise `UserRepository::NotFoundError` instead of returning `nil`. The call site is updated at the second `CHANGE 2` marker to rescue `UserRepository::NotFoundError` and render a proper 404 response.

**Explanation:** Returning `nil` as a sentinel for "record not found" forces every caller to guard against nil before using the object. In practice callers forget, or forget one path, and the nil leaks into view rendering. Raising a typed exception puts the responsibility on the caller to decide what to do with a missing record, and the failure manifests at the right place with the right message. Controllers in Rails can also use `rescue_from UserRepository::NotFoundError` to handle this globally, which avoids repeating the rescue block across actions.

---

### Issue 3: Original Exception Context Is Lost

**Problem:** Even if a developer eventually adds logging, returning nil or raising a new error without chaining the original means the root cause is invisible. The ActiveRecord message often includes the ID that was looked up, which is critical when debugging production issues where `params[:id]` may be malformed.

**Fix:** At `CHANGE 3`, the new `NotFoundError` is initialized with `"User not found: #{e.message}"`, embedding the original ActiveRecord message into the domain error's message string.

**Explanation:** `ActiveRecord::RecordNotFound` messages look like `"Couldn't find User with 'id'=99999"`. Wrapping that in the new exception preserves the ID and the model name in whatever log or error tracker receives the exception. A further improvement is to pass `e` as the `cause` by using `raise UserRepository::NotFoundError, e.message` — Ruby automatically sets `$!.cause` to the previous exception when you raise inside a rescue block, so Sentry and structured loggers will still show the full chain without any extra code.
