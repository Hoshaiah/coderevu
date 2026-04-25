---
slug: sql-injection-string-concat
track: java
orderIndex: 100
title: User-supplied search term is concatenated directly into a SQL query
difficulty: easy
tags:
  - security
  - sql-injection
  - jdbc
language: java
---

## Context

This REST endpoint lets customers search their own order history by product name. The handler extracts the query parameter and forwards it to a DAO that runs a LIKE search. In a routine penetration test, the tester was able to dump the entire `orders` table including other customers' data by appending `%' OR '1'='1` to the search term.

The application uses plain JDBC against a PostgreSQL database.

## Buggy code

```java
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
        String sql = "SELECT order_id FROM orders WHERE customer_id = "
                + customerId
                + " AND product_name LIKE '%" + productName + "%'";
        List<String> results = new ArrayList<>();
        try (Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(sql)) {
            while (rs.next()) {
                results.add(rs.getString("order_id"));
            }
        }
        return results;
    }
}
```
