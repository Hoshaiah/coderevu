---
slug: exception-in-finally-masks-original
track: java
orderIndex: 86
title: Finally Block Masks Original Exception
difficulty: medium
tags:
  - exceptions
  - resource-management
  - error-handling
language: java
---

## Context

This data access method lives in `src/main/java/com/acme/billing/InvoiceDao.java`. It opens a JDBC connection, executes a query, and closes resources in a `finally` block. The team deliberately chose not to use try-with-resources because a legacy connection-pool wrapper requires explicit close semantics.

When the database is under heavy load and the query times out, the ops team expects to see a `SQLTimeoutException` in the logs with the offending SQL. Instead, the logs show only a `NullPointerException` with no SQL context, making triage very difficult. The actual timeout is nowhere in the error chain.

A developer added extra logging before and after every statement and confirmed the `SQLTimeoutException` is definitely thrown — it just never appears in the error log.

## Buggy code

```java
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
            rs.close();
            ps.close();
            conn.close();
        }
    }
}
```
