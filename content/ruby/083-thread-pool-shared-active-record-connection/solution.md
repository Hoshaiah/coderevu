## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Shared Connection Across Threads
# ------------------------------------------------------------------------

class BulkReportJob
  include Sidekiq::Job

  # CHANGE 3: cap concurrency to avoid exhausting the AR connection pool; tune to pool size minus headroom
  MAX_THREADS = 5

  def perform(report_id)
    report = Report.find(report_id)
    segments = report.segments.to_a

    results = []
    mutex = Mutex.new
    semaphore = Mutex.new
    available = MAX_THREADS
    cond = ConditionVariable.new

    threads = segments.map do |segment|
      # CHANGE 3: throttle thread creation so we never hold more than MAX_THREADS concurrent AR connections
      semaphore.synchronize do
        cond.wait(semaphore) while available == 0
        available -= 1
      end

      Thread.new do
        begin
          # CHANGE 1: check out a dedicated connection for this thread so it never shares the parent's connection
          ActiveRecord::Base.connection_pool.with_connection do
            rows = Order.where(segment_id: segment.id).to_a
            mutex.synchronize { results << { segment: segment.id, rows: rows } }
          end
        rescue => e
          # CHANGE 2: capture thread errors explicitly so the job fails loudly instead of silently dropping data
          mutex.synchronize { results << { segment: segment.id, error: e.message } }
          raise
        ensure
          # CHANGE 3: release the semaphore slot so waiting threads can proceed
          semaphore.synchronize do
            available += 1
            cond.signal
          end
        end
      end
    end

    threads.each(&:join)
    ReportBuilder.compile(results)
  end
end
```

## Explanation

### Issue 1: Shared ActiveRecord Connection Across Threads

**Problem:** Every `Thread.new` block inherits the connection already checked out by the parent thread. When two threads issue queries concurrently on the same `PGconn` object, the responses interleave at the wire level. Operators see `PG::InFailedSqlTransaction` (one thread sees another thread's aborted transaction state) or rows appearing in the wrong report section (result sets mixed together).

**Fix:** Wrap each thread's database work in `ActiveRecord::Base.connection_pool.with_connection do … end` (added at CHANGE 1). This checks out a fresh, dedicated connection for the thread's lifetime and returns it to the pool when the block exits.

**Explanation:** ActiveRecord's connection pool is designed so that each thread gets its own connection, but only if it explicitly requests one. When a thread is spawned inside a block that already holds a connection, Rails does not automatically fork that connection — the child thread ends up referencing the same underlying `PGconn`. Two concurrent `SELECT` calls on one socket send bytes in overlapping bursts; Postgres reads them as a single malformed command or responds to the wrong caller. `with_connection` acquires an independent socket from the pool and guarantees it is released even if an exception is raised, preventing connection leaks. A related pitfall: if you use `ActiveRecord::Base.connection` directly inside the thread instead of `with_connection`, you hold the connection beyond the thread's lifetime unless you manually call `connection_pool.release_connection`.

---

### Issue 2: Unhandled Thread Exceptions Silently Drop Data

**Problem:** Ruby threads do not propagate exceptions to the parent thread until `Thread#join` is called. If an exception is raised inside a thread before `mutex.synchronize` runs, that segment's rows are never appended to `results`. The job then calls `ReportBuilder.compile` with an incomplete result set and may return a subtly wrong report with no error logged.

**Fix:** Add a `begin/rescue/raise` block inside the thread (CHANGE 2) that catches any exception, records a structured error entry in `results` so the gap is visible, then re-raises so `threads.each(&:join)` surfaces the exception and fails the Sidekiq job rather than marking it successful.

**Explanation:** Without the rescue, an exception inside the thread is stored on the `Thread` object itself and stays silent. `join` will re-raise it, but only after all threads have finished — by that point `ReportBuilder.compile` has already run with incomplete data if you are not careful about ordering. Logging or storing the error in `results` before re-raising gives operators an audit trail of which segment failed. Re-raising is important because Sidekiq's retry logic depends on the job raising an exception; swallowing it would mark the job as succeeded and suppress retries.

---

### Issue 3: Unbounded Thread Count Exhausts the Connection Pool

**Problem:** The original code spawns exactly as many threads as there are segments. Under load, if a report has 50 segments and the AR connection pool has 10 connections, 40 threads block waiting for a connection and trigger `ActiveRecord::ConnectionTimeoutError`. Operators see this as sporadic job failures that correlate with large reports.

**Fix:** Introduce a `MAX_THREADS` constant (CHANGE 3) and a `Mutex`/`ConditionVariable` semaphore pair that throttles thread creation so no more than `MAX_THREADS` threads are running database work simultaneously. The `ensure` block signals the condition variable when a thread finishes, allowing the next thread to proceed.

**Explanation:** The AR connection pool has a fixed size set in `database.yml`. Every thread that calls `with_connection` occupies one slot. If the number of threads exceeds the pool size, `with_connection` raises `ConnectionTimeoutError` after `checkout_timeout` seconds. The semaphore pattern here is a simple counting semaphore: `available` tracks free slots, and threads wait on `cond` if none are free. `MAX_THREADS` should be set to at most `pool_size - 1` to leave one connection free for the main thread and other background tasks. An alternative approach is to use a thread pool library such as `concurrent-ruby`'s `FixedThreadPool`, which provides the same back-pressure with less boilerplate.
