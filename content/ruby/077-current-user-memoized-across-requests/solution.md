## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Memoized Current User Leaks Between Requests
# ------------------------------------------------------------------------

module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_login
  end

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def require_login
    redirect_to login_path unless current_user
  end
end

class ApplicationController < ActionController::Base
  include Authentication

  # CHANGE 1: Removed self.cached_user and self.cached_user= entirely — class-level instance variables are shared across all Puma threads, so storing a per-request user there causes thread A to see thread B's user.
  # CHANGE 2: Removed the before_action that wrote current_user into the class-level cache — it was never read back and was the sole source of the cross-request user leak.
end
```

## Explanation

### Issue 1: Class-level variable shared across threads

**Problem:** Users on staging occasionally see another user's data for a single page load. The symptom is non-deterministic and only appears under Puma's multi-threaded mode, never with a single-threaded server.

**Fix:** Remove `self.cached_user` and `self.cached_user=` from `ApplicationController`. These two class-method definitions and the `@cached_user` class-level instance variable they wrap are deleted entirely (CHANGE 1).

**Explanation:** In Ruby, `@cached_user` on the class object (`ApplicationController`) is a single memory location shared by every instance of that class — and therefore by every thread in the same process. Under Puma, two requests can run concurrently on two threads, both executing `self.class.cached_user = current_user`. Thread A sets the class variable to User 42, then thread B sets it to User 99 before thread A has finished rendering. If anything downstream in thread A later reads `self.class.cached_user`, it gets User 99. The per-request instance variable `@current_user` is safe because each request gets its own controller instance; the class-level variable is not safe because all instances share the same class object. The fix is to delete the class-level cache entirely.

---

### Issue 2: Unused cache write with no corresponding read

**Problem:** The `before_action` block in `ApplicationController` calls `self.class.cached_user = current_user` on every request, but nothing in the codebase ever calls `self.class.cached_user` to retrieve that value. The cache provides zero performance benefit while introducing the race condition described in Issue 1.

**Fix:** Remove the `before_action` block that writes to `self.class.cached_user` (CHANGE 2). The existing `@current_user ||= ...` memoization in `current_user` already prevents duplicate database queries within a single request.

**Explanation:** The intent was to avoid hitting the database more than once per request, but `current_user` already achieves that with `@current_user ||=`, which short-circuits after the first call within the same controller instance. The `before_action` writing to the class-level cache is a second, broken attempt at the same thing. Because no code reads `self.class.cached_user` back, removing the `before_action` has no observable effect on behavior except eliminating the thread-safety hazard. A related pitfall: if someone had wired up a read from `self.class.cached_user`, the fix would need to replace that read with a call to `current_user` so it uses the safe instance-level memoization instead.
