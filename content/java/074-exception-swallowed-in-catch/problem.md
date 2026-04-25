---
slug: exception-swallowed-in-catch
track: java
orderIndex: 74
title: Original Exception Swallowed in Catch
difficulty: easy
tags:
  - exceptions
  - error-handling
  - debugging
language: java
---

## Context

This code lives in `src/main/java/com/example/data/UserRepository.java`, a DAO class that loads user records from a relational database. The `findById` method is called from multiple service layers and is expected to either return a user or throw a descriptive application exception so callers can handle errors uniformly.

In production, database connectivity problems are being reported as generic `DataAccessException: user lookup failed` messages with no root cause. The on-call engineer cannot tell from the logs whether the problem was a connection timeout, a SQL syntax error, or a missing table — all three appear identically. Debugging takes much longer than it should because the original exception detail is missing from every alert.

## Buggy code

```java
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
        try {
            PreparedStatement ps = conn.prepareStatement(
                "SELECT id, name, email FROM users WHERE id = ?");
            ps.setLong(1, id);
            ResultSet rs = ps.executeQuery();
            if (rs.next()) {
                return new User(rs.getLong(1), rs.getString(2), rs.getString(3));
            }
            return null;
        } catch (SQLException e) {
            throw new DataAccessException("user lookup failed");
        }
    }
}
```
