## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — User-supplied search term is concatenated directly into a SQL query
// ------------------------------------------------------------------------
import java.sql.*;
import java.util.ArrayList;
import java.util.List;

public class OrderSearchDao {

    private final Connection conn;

    public OrderSearchDao(Connection conn) {
        this.conn = conn;
    }

    public List<String> searchByProduct(int customerId, String productName)
            throws SQLException {
        // CHANGE 1: Use a parameterized query with ? placeholders instead of concatenating user input directly into the SQL string. This prevents SQL injection because the driver sends the SQL structure and the parameter values to the database separately.
        // CHANGE 2: Switch from Statement to PreparedStatement so that parameter binding via setInt/setString is available.
        String sql = "SELECT order_id FROM orders WHERE customer_id = ?"
                + " AND product_name LIKE ?";
        List<String> results = new ArrayList<>();
        try (PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setInt(1, customerId);
            // CHANGE 1 (continued): The % wildcards are added here in Java,
            // so they are part of the bound value, not part of the SQL syntax.
            stmt.setString(2, "%" + productName + "%");
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    results.add(rs.getString("order_id"));
                }
            }
        }
        return results;
    }
}
```

## Explanation

### Issue 1: SQL injection via string concatenation

**Problem:** An attacker who controls `productName` can close the SQL string literal early and append arbitrary SQL. Sending `%' OR '1'='1` turns the WHERE clause into `customer_id = 123 AND product_name LIKE '%%' OR '1'='1'`, which returns every row in the table — including other customers' orders.

**Fix:** The SQL string is rewritten to use `?` placeholders, and `stmt.setString(2, "%" + productName + "%")` supplies the value as a bound parameter. The `%` wildcards are prepended and appended in Java before the bind call, so they travel to the database as part of the data value, not as SQL syntax.

**Explanation:** When you concatenate user input into a SQL string, the database parser sees one undifferentiated character stream and has no way to distinguish intended SQL keywords from attacker-supplied ones. A `PreparedStatement` solves this by sending the query template to the database first (during `prepareStatement`), where it is parsed and compiled. The parameter values are transmitted later in a separate protocol phase and are never interpreted as SQL. Even if `productName` contains single quotes, `OR`, or subqueries, the driver escapes or encodes them so the database treats the entire value as a literal string. One related pitfall: if you ever build the `?`-based template string dynamically (e.g., a variable number of IN-list items) using concatenation of untrusted data, you reintroduce the same risk, so keep template construction separate from value injection.

---

### Issue 2: Plain Statement instead of PreparedStatement

**Problem:** The original code creates a `Statement` via `conn.createStatement()`. A `Statement` has no mechanism to accept bound parameters — it only executes raw SQL strings. This forced the author to concatenate values into the string in the first place.

**Fix:** `conn.createStatement()` is replaced with `conn.prepareStatement(sql)`, returning a `PreparedStatement`. The `setInt` and `setString` calls on that object supply the actual runtime values for the two `?` placeholders.

**Explanation:** `Statement` and `PreparedStatement` are separate interfaces in JDBC. `Statement.executeQuery` takes a complete SQL string; `PreparedStatement.executeQuery` takes no argument because the SQL was already given to `prepareStatement` and the parameters have been bound via the `setX` methods. Switching the variable type to `PreparedStatement` and the factory call to `prepareStatement` is what makes binding possible at all. A secondary benefit is that `PreparedStatement` objects can be cached and reused by the connection pool driver, reducing parse overhead on repeated calls — but the primary reason for the change here is correctness, not performance.
