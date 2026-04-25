---
slug: errors-is-wrapped-sentinel-miss
track: go
orderIndex: 69
title: Sentinel Missed Through Error Wrap
difficulty: hard
tags:
  - errors
  - context
  - api-misuse
language: go
---

## Context

This code is in `internal/repo/user.go`, a repository layer over PostgreSQL. The service uses a layered architecture where the HTTP handler checks for domain errors like `ErrNotFound` to return appropriate HTTP status codes. The pattern is used consistently across 30+ repository functions.

After a recent refactor to add request tracing (which involved wrapping errors with additional context), the HTTP layer started returning HTTP 500 for records that don't exist instead of HTTP 404. The database query is still correctly returning `sql.ErrNoRows` in those cases.

The team checked that `ErrNotFound` is still defined and that the HTTP handler's `errors.Is(err, ErrNotFound)` call looks correct. They have not yet realized that the wrapping changed.

## Buggy code

```go
package repo

import (
	"database/sql"
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID    int
	Email string
}

func GetUser(db *sql.DB, id int) (*User, error) {
	var u User
	err := db.QueryRow("SELECT id, email FROM users WHERE id = $1", id).Scan(&u.ID, &u.Email)
	if err != nil {
		if err == sql.ErrNoRows {
			// Wrap with context for tracing — introduced during refactor
			return nil, fmt.Errorf("user %d: %v", id, ErrNotFound)
		}
		return nil, fmt.Errorf("query user %d: %w", id, err)
	}
	return &u, nil
}
```
