## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Finally Block Masks Original Exception
// ------------------------------------------------------------------------

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class InvoiceDao {
    private final javax.sql.DataSource dataSource;

    public InvoiceDao(javax.sql.DataSource dataSource) {
        this.dataSource = dataSource;
    }

    public List<String> findOverdue(int customerId) throws SQLException {
        Connection conn = null;
        PreparedStatement ps = null;
        ResultSet rs = null;
        try {
            conn = dataSource.getConnection();
            ps = conn.prepareStatement(
                "SELECT id FROM invoices WHERE customer_id = ? AND due_date < NOW()");
            ps.setInt(1, customerId);
            rs = ps.executeQuery();
            List<String> ids = new ArrayList<>();
            while (rs.next()) {
                ids.add(rs.getString("id"));
            }
            return ids;
        } finally {
            // CHANGE 1+2: wrap each close() in its own try/catch so a null reference or close failure never throws out of finally and never masks the original exception; CHANGE 3: close in rs -> ps -> conn order so outer resources outlive inner ones
            if (rs != null) {
                try { rs.close(); } catch (SQLException e) { /* suppress: primary exception takes priority */ }
            }
            if (ps != null) {
                try { ps.close(); } catch (SQLException e) { /* suppress: primary exception takes priority */ }
            }
            if (conn != null) {
                try { conn.close(); } catch (SQLException e) { /* suppress: primary exception takes priority */ }
            }
        }
    }
}
```

## Explanation

### Issue 1: Null reference in finally block

**Problem:** If `dataSource.getConnection()` succeeds but `conn.prepareStatement()` throws (or any step before `rs` is assigned throws), then `rs` is still `null` when the `finally` block runs. Calling `rs.close()` on a `null` reference throws a `NullPointerException` immediately, before the original `SQLTimeoutException` can propagate.

**Fix:** Each close call is now guarded by an `if (x != null)` check before it executes, so a variable that was never assigned is simply skipped.

**Explanation:** Java's `finally` block always runs, even when the `try` block is already propagating an exception. If the `finally` block itself throws, the JVM discards the in-flight exception entirely and propagates the new one instead. Because the timeout happens inside `ps.executeQuery()`, `rs` is never assigned, so `rs` is `null` at close time. The `NullPointerException` from `rs.close()` then completely replaces the `SQLTimeoutException`, which is why ops never sees it. Guarding with `!= null` prevents the spurious throw.

---

### Issue 2: finally block throw discards the primary exception

**Problem:** Even if all variables were non-null, any `SQLException` thrown by `rs.close()`, `ps.close()`, or `conn.close()` would silently replace whatever exception was already propagating from the `try` block. The `SQLTimeoutException` disappears with no trace in the error chain.

**Fix:** Each close call is wrapped in its own `try/catch(SQLException)` that swallows the close-time exception, keeping the primary exception intact so it propagates to the caller and into the logs.

**Explanation:** When a `finally` block throws, Java replaces the suppressed exception with the new one. There is no automatic chaining. The original exception is gone — not wrapped, not logged, just dropped. Swallowing close exceptions inside `finally` is the standard pattern when you cannot use try-with-resources (which calls `Throwable.addSuppressed` automatically). If you wanted to preserve the close error for diagnostics, you could log it at `WARN` level inside the `catch`, but it must not be re-thrown.

---

### Issue 3: Wrong resource close order

**Problem:** The original code closes `rs`, then `ps`, then `conn`, which is the correct order in terms of dependency (inner to outer). However, if `rs.close()` were to throw and escape, `ps` and `conn` would be leaked. The individual wrapping in this fix also enforces that each resource is closed independently regardless of failures in the others.

**Fix:** The close sequence `rs` → `ps` → `conn` is preserved, and each is in its own `try/catch` block so a failure on one does not prevent the others from being closed.

**Explanation:** JDBC resources form a containment hierarchy: `ResultSet` lives inside `PreparedStatement`, which lives inside `Connection`. Closing them outer-to-inner (e.g., `conn` first) can leave `ResultSet` or `PreparedStatement` in an undefined state on some drivers. Closing inner-to-outer is correct. Separating each close into its own `try/catch` guarantees that even if `rs.close()` throws a checked exception, the `ps.close()` and `conn.close()` calls still execute, preventing connection leaks back to the pool.
