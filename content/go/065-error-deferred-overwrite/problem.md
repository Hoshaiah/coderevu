---
slug: error-deferred-overwrite
track: go
orderIndex: 65
title: Deferred Error Overwrites Real Error
difficulty: medium
tags:
  - errors
  - correctness
  - defer
language: go
---

## Context

This function is in `internal/store/transaction.go`. It wraps a database transaction: it begins a transaction, calls a user-supplied function, and either commits or rolls back depending on whether the function returned an error. Named return values are used so the defer can modify the final error.

Callers report that when the user function returns a meaningful domain error (e.g. `ErrInsufficientFunds`), the caller receives `nil` instead. However when the user function panics or when `Commit` itself fails, the error is propagated correctly.

The team added logging inside the defer and confirmed that `txErr` is correctly non-nil when the defer runs, but the value returned to the caller is nil.

## Buggy code

```go
package store

import (
	"context"
	"database/sql"
	"fmt"
)

func RunInTx(ctx context.Context, db *sql.DB, fn func(*sql.Tx) error) (err error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	defer func() {
		if err != nil {
			_ = tx.Rollback()
			err = nil // "clean up" the error after rollback
			return
		}
		if commitErr := tx.Commit(); commitErr != nil {
			err = fmt.Errorf("commit: %w", commitErr)
		}
	}()

	err = fn(tx)
	return
}
```
