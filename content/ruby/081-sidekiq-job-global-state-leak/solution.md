## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Thread-Local Leak Between Jobs
# ------------------------------------------------------------------------

# config/initializers/sidekiq.rb
Sidekiq.configure_server do |config|
  config.server_middleware do |chain|
    chain.add TenantMiddleware
  end
end

# app/middleware/tenant_middleware.rb
class TenantMiddleware
  def call(worker, job, queue)
    account_id = job["account_id"]
    Current.account_id = account_id
    yield
  ensure
    # CHANGE 1: Always reset Current.account_id to nil after the job completes (or raises) so the thread-local value never leaks into the next job on this thread.
    # CHANGE 2: Using ensure guarantees the reset runs even when the job raises an exception, preventing stale tenant state from surviving an error path.
    Current.account_id = nil
  end
end

# app/workers/report_worker.rb
class ReportWorker
  include Sidekiq::Worker

  def perform(account_id)
    # Current.account_id is expected to be set by middleware
    records = Record.where(account_id: Current.account_id).all
    ReportMailer.send_report(records).deliver_now
  end
end
```

## Explanation

### Issue 1: Thread-local value leaks to next job

**Problem:** Operators see reports that contain rows belonging to a different tenant. This happens when a job runs on a thread that previously executed a job for another tenant, and the `account_id` key is absent or falsy in the new job's payload, leaving `Current.account_id` pointing at the old tenant.

**Fix:** Add an `ensure` block in `TenantMiddleware#call` that sets `Current.account_id = nil` after `yield` returns, so the thread-local is always wiped before the thread is returned to the pool and picks up the next job.

**Explanation:** Sidekiq reuses OS threads across many jobs. `Current` (a `ActiveSupport::CurrentAttributes` subclass) stores its data in a thread-local hash. Without an explicit reset, whatever value was written during job A remains readable during job B on the same thread. The bug is intermittent because it only surfaces when job B's payload lacks an `account_id` key — in that case the middleware sets `Current.account_id = nil`, which hides the problem most of the time, but when a job is enqueued without that key at all the old value persists. Setting `Current.account_id = nil` unconditionally in `ensure` makes the post-job state deterministic regardless of what the next job's payload contains. Note that `ActiveSupport::CurrentAttributes` also exposes a `reset` class method that clears all attributes at once, which is a safer long-term approach if more attributes are added later.

---

### Issue 2: Exception in job skips tenant cleanup

**Problem:** When the job body raises an unhandled exception (a database error, a mailer timeout, etc.), Ruby unwinds the stack and jumps past the code after `yield` in the middleware. The `Current.account_id` is never cleared, so the thread carries the tenant identity into the next job.

**Fix:** Wrapping `yield` in a `begin`/`ensure` block (written here as `yield` followed by `ensure` directly in the method body) guarantees `Current.account_id = nil` runs whether the job succeeds or raises. This is the `# CHANGE 2` site in the reference solution.

**Explanation:** Without `ensure`, the cleanup line after `yield` is just ordinary sequential code — Ruby only executes it if `yield` returns normally. Any raise causes execution to skip it entirely. `ensure` is Ruby's mechanism for code that must run regardless of the control-flow path (normal return, `raise`, `next`, `break`). Sidekiq catches job exceptions internally and retries or dead-letters the job, but that happens outside the middleware's `call` frame, so the middleware's own stack is already unwound by then. Placing the reset in `ensure` closes this gap. A related pitfall: if you use `Thread.current[:account_id]` directly instead of `Current`, the same ensure-less pattern causes the same leak, so the fix applies to either approach.
