---
slug: error-type-assertion-lost
track: go
orderIndex: 55
title: Wrapped Error Type Lost in Assert
difficulty: medium
tags:
  - errors
  - error-handling
  - api-misuse
language: go
---

## Context

This code lives in `pkg/storage/postgres.go`, a thin wrapper around the `pgx` Postgres driver. The function `InsertUser` is supposed to return a typed `*DuplicateKeyError` when a unique-constraint violation occurs so the HTTP layer can return a 409 instead of 500. Elsewhere in the codebase, callers use a type-assertion `err.(*DuplicateKeyError)` to detect the conflict.

The HTTP handler keeps returning 500 for duplicate email addresses even though the Postgres error code is correct (class `23` — integrity constraint violation). Adding a log line right after the `InsertUser` call shows the error is non-nil, but a type assertion to `*DuplicateKeyError` always fails. The team added `errors.Is` checks but that only works for sentinel values, not types.

A code review flagged that `fmt.Errorf` was being used somewhere in the chain, but nobody could immediately see how that would affect a type assertion.

## Buggy code

```go
package storage

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

type DuplicateKeyError struct {
	Constraint string
}

func (e *DuplicateKeyError) Error() string {
	return fmt.Sprintf("duplicate key on constraint %s", e.Constraint)
}

func InsertUser(email string, exec func(string) error) error {
	err := exec(email)
	if err == nil {
		return nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code[:2] == "23" {
		dupeErr := &DuplicateKeyError{Constraint: pgErr.ConstraintName}
		// Wrap to attach context, but preserve the error chain
		return fmt.Errorf("insert user %s: %w", email, dupeErr)
	}

	return fmt.Errorf("insert user %s: %w", email, err)
}
```
