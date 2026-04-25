## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — Unbounded DELETE Locks Table
// ------------------------------------------------------------------------

<?php
// src/Jobs/PurgeExpiredSessions.php

require_once __DIR__ . '/../../src/db.php';

// CHANGE 1: Accept a configurable batch size so callers can tune lock duration vs. throughput.
function purgeExpiredSessions(PDO $pdo, int $batchSize = 1000): void
{
    $totalDeleted = 0;

    // CHANGE 1: Loop in small batches instead of one unbounded DELETE so each statement holds the exclusive row-locks for only milliseconds, letting live reads interleave between batches.
    do {
        // CHANGE 2: Wrap each batch in a try/catch so database errors are logged and the loop exits cleanly rather than silently swallowing the exception.
        try {
            $stmt = $pdo->prepare(
                "DELETE FROM sessions WHERE expires_at < NOW() LIMIT :limit"
            );
            // CHANGE 1: Bind the batch-size limit to keep each DELETE small and bounded.
            $stmt->bindValue(':limit', $batchSize, PDO::PARAM_INT);
            $stmt->execute();

            $deleted = $stmt->rowCount();
            $totalDeleted += $deleted;

            // CHANGE 1: Sleep briefly between batches to yield CPU and connection time to live application queries.
            if ($deleted === $batchSize) {
                usleep(50000); // 50 ms pause between batches
            }
        } catch (\Throwable $e) {
            // CHANGE 2: Log the real exception message and stop the loop so ops can investigate rather than seeing a silent 0-deleted entry.
            error_log("[PurgeExpiredSessions] Error during batch delete: " . $e->getMessage());
            break;
        }
    } while ($deleted === $batchSize);

    // CHANGE 3: Log the accurate cumulative total after all batches, so the number reflects reality even when earlier batches deleted rows before a failure.
    error_log("[PurgeExpiredSessions] Deleted {$totalDeleted} expired sessions.");
}

purgeExpiredSessions($pdo);
```

## Explanation

### Issue 1: Unbounded DELETE Holds Table Lock

**Problem:** A single `DELETE FROM sessions WHERE expires_at < NOW()` with no `LIMIT` acquires exclusive row locks on every matching row — potentially hundreds of thousands — in one atomic operation. While that statement runs (30–90 seconds on 4 million rows), every concurrent `SELECT` that needs any of those rows blocks, causing the application-wide unresponsiveness operations observes at 02:00.

**Fix:** Replace the single unbounded `DELETE` with a `do/while` loop that issues `DELETE FROM sessions WHERE expires_at < NOW() LIMIT :limit` with `:limit` bound to `$batchSize` (default 1000). A 50 ms `usleep` between batches yields the connection back to live traffic. The loop exits when a batch deletes fewer rows than `$batchSize`, meaning the expired set is exhausted.

**Explanation:** MySQL's InnoDB engine holds row-level locks for the lifetime of a statement, not just for the moment a row is touched. When the DELETE matches 300,000 rows, all 300,000 lock entries exist simultaneously until the statement commits. Live `SELECT` queries that touch even one of those session rows queue behind the lock. Splitting into 1,000-row batches means each batch commits in milliseconds and releases its locks before the next batch begins, so reads can interleave. The added index on `expires_at` makes each small batch fast to execute but does nothing to reduce the lock-hold window of an unbounded statement — that is the key distinction. The `usleep` is optional tuning; even without it, the inter-batch commit points are enough to unblock reads.

---

### Issue 2: Exceptions Are Not Caught

**Problem:** If the database connection drops, a deadlock occurs, or any other `PDOException` is thrown inside the loop, PHP will either terminate the script silently (if PDO error mode is `SILENT`) or emit an unhandled exception with no structured recovery. In either case the job exits without logging a useful message and without indicating how many rows were already deleted.

**Fix:** Each batch iteration is wrapped in a `try/catch (\Throwable $e)` block. On failure, `error_log` records the exception message and `break` exits the loop cleanly, allowing the cumulative `$totalDeleted` to still be logged.

**Explanation:** Background workers run outside a web request where a framework exception handler would catch and report errors. Without an explicit catch, a deadlock retry scenario — which InnoDB triggers automatically for short locks — can still surface as an unhandled exception if the retry limit is exceeded. Catching `\Throwable` rather than `\Exception` also covers PHP fatal errors like `Error` (e.g., type mismatches from bad configuration). Logging the actual message gives on-call engineers an actionable starting point instead of a missing log line.

---

### Issue 3: Row Count Logged Before All Batches Complete

**Problem:** The original code logs `$deleted` from a single statement. If that one statement is replaced naively with a loop but the log call stays inside the loop body, each intermediate batch logs a partial count, making it impossible to tell from the logs how many sessions were actually removed in total.

**Fix:** A `$totalDeleted` accumulator is incremented by each batch's `$stmt->rowCount()` inside the loop. The single `error_log` call with `$totalDeleted` moves to after the loop so it always reflects the true cumulative total, regardless of how many iterations ran or whether the loop exited early via `break`.

**Explanation:** `PDOStatement::rowCount()` returns the count for the most recently executed statement only. In a loop, each call overwrites the previous value. Accumulating into a separate variable and logging once after the loop is the standard pattern for batch jobs. This also means that if an exception triggers `break`, the log still shows how many rows were cleaned before the failure, which helps distinguish a partial-success from a total failure when reviewing logs.
