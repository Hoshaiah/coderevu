---
slug: sql-rows-not-closed
track: go
orderIndex: 99
title: Database connection pool exhausted because rows are never closed
difficulty: medium
tags:
  - resource-management
  - database
  - sql
  - leaks
language: go
---

## Context

This function is part of a reporting service that runs dozens of queries per second to build dashboard data. Under sustained load the service starts throwing `context deadline exceeded` errors when acquiring new connections, and the `database/sql` pool metrics show all connections are in use. A restart temporarily fixes it.

## Buggy code

```go
package reports

import (
	"context"
	"database/sql"
	"fmt"
)

type Order struct {
	ID     int64
	Amount float64
}

func FetchOrders(ctx context.Context, db *sql.DB, userID int64) ([]Order, error) {
	rows, err := db.QueryContext(ctx,
		"SELECT id, amount FROM orders WHERE user_id = $1", userID)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}

	var orders []Order
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.Amount); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}
	return orders, nil
}
```
