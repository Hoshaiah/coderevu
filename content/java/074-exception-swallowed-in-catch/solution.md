## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Original Exception Swallowed in Catch
// ------------------------------------------------------------------------

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class UserRepository {
    private final Connection conn;

    public UserRepository(Connection conn) {
        this.conn = conn;
    }

    public User findById(long id) {
        // CHANGE 2: use try-with-resources so PreparedStatement and ResultSet are always closed, even on exception
        try (PreparedStatement ps = conn.prepareStatement(
                "SELECT id, name, email FROM users WHERE id = ?")) {
            ps.setLong(1, id);
            // CHANGE 2: ResultSet also declared in try-with-resources to guarantee closure
            try (ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    return new User(rs.getLong(1), rs.getString(2), rs.getString(3));
                }
                return null;
            }
        } catch (SQLException e) {
            // CHANGE 1: pass 'e' as the cause so the original SQLException is preserved in the exception chain
            throw new DataAccessException("user lookup failed", e);
        }
    }
}
```

## Explanation

### Issue 1: Original Exception Swallowed in Catch

**Problem:** Every `SQLException` — whether it is a connection timeout, a bad SQL statement, or a missing table — surfaces to callers and log aggregators as `DataAccessException: user lookup failed` with no further detail. The on-call engineer sees identical alerts for completely different failure modes and cannot diagnose the root cause without attaching a debugger or adding temporary logging.

**Fix:** Replace `throw new DataAccessException("user lookup failed")` with `throw new DataAccessException("user lookup failed", e)`, passing the caught `SQLException` as the second argument (the cause) to `DataAccessException`'s two-argument constructor.

**Explanation:** Java's `Throwable` class carries an optional `cause` field that the runtime prints as `Caused by:` in stack traces and that frameworks like Spring and logging libraries expose in structured log output. When you call `new DataAccessException("user lookup failed")`, the one-argument constructor leaves `cause` null, so `getCause()` returns null and the original `SQLException` — including its SQL state, vendor error code, and stack frames — is garbage-collected. Passing `e` as the cause chains the two exceptions together, so any code that calls `getCause()` or logs the exception tree will see the full detail. A related pitfall: if `DataAccessException` only has a one-argument constructor, you need to add `initCause(e)` after construction or extend the constructor — the key invariant is that `e` must be reachable from the thrown exception's cause chain.

---

### Issue 2: PreparedStatement and ResultSet Never Closed

**Problem:** The original code never closes `ps` or `rs`. If the method returns normally, both objects stay open until the `Connection` closes (or the JVM finalizes them, which is not guaranteed). Under load, with many calls to `findById`, the database server exhausts its cursor limit and starts rejecting new queries, or the JDBC driver runs out of statement handles.

**Fix:** Wrap `PreparedStatement ps` in a try-with-resources block and nest a second try-with-resources block for `ResultSet rs = ps.executeQuery()`. Both `PreparedStatement` and `ResultSet` implement `AutoCloseable`, so the compiler inserts the `close()` calls in a `finally`-equivalent region that runs whether the method returns normally or throws.

**Explanation:** `Connection.prepareStatement` allocates a server-side cursor. If `close()` is never called, that cursor stays open on the database until the connection itself is returned to a pool and re-initialized — or indefinitely if the pool does not reset cursors. `try-with-resources` (introduced in Java 7) handles this by calling `close()` on each declared resource in reverse declaration order, even when an exception is in flight. Nesting the `ResultSet` in its own inner `try-with-resources` ensures it is closed before the `PreparedStatement` is closed, which matches the correct teardown order. A common mistake is to declare both resources in the same `try` header: that works too, but splitting them makes the teardown order explicit and mirrors the open order.
