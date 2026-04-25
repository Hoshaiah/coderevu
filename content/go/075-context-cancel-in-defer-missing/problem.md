---
slug: context-cancel-in-defer-missing
track: go
orderIndex: 75
title: Context Cancel Never Called
difficulty: easy
tags:
  - context
  - goroutines
  - resource-management
language: go
---

## Context

This helper lives in `internal/store/lookup.go` and wraps a database query with a per-call timeout. It is called thousands of times per second from a high-traffic search API. The application targets Go 1.21 and uses `database/sql`.

After a few hours under load, the process memory grows steadily and goroutines accumulate. `pprof` shows a large number of goroutines blocked inside the context package internals. The database queries themselves complete quickly and return correct data.

The team verified that the `db.QueryContext` call is not leaking — the `*sql.Rows` is properly closed. The leak is happening somewhere in the context machinery itself.

## Buggy code

```go
package store

import (
	"context"
	"database/sql"
	"time"
)

type Product struct {
	ID   int
	Name string
}

func LookupProduct(ctx context.Context, db *sql.DB, id int) (*Product, error) {
	qCtx, _ := context.WithTimeout(ctx, 3*time.Second)

	row := db.QueryRowContext(qCtx, "SELECT id, name FROM products WHERE id = $1", id)

	var p Product
	if err := row.Scan(&p.ID, &p.Name); err != nil {
		return nil, err
	}
	return &p, nil
}
```
