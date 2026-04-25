---
slug: error-fmt-non-nil-nil-wrap
track: go
orderIndex: 60
title: fmt.Errorf Wraps nil Into Error
difficulty: medium
tags:
  - errors
  - context
  - correctness
language: go
---

## Context

This database helper lives in `internal/store/user.go`. It looks up a user by email and returns a typed sentinel error `ErrNotFound` when the row does not exist. Callers use `errors.Is(err, ErrNotFound)` to decide whether to create a new user or abort.

After a refactor to add request tracing, callers began reporting that `errors.Is(err, ErrNotFound)` always returns false even when the user genuinely does not exist. The store function still appears to return the right error based on log output, but the sentinel check fails.

The team added `fmt.Println(err)` in the caller and saw `"lookup user: user not found"` printed — confirming the error is non-nil — but `errors.Is` returns false. They ruled out a missing `Unwrap` method on a custom type.

## Buggy code

```go
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("user not found")

type Store struct{ db *sql.DB }

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		"SELECT id, email FROM users WHERE email = $1", email,
	).Scan(&u.ID, &u.Email)

	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}

	return &u, fmt.Errorf("lookup user: %w", err)
}

type User struct {
	ID    int64
	Email string
}
```
