---
slug: error-sentinel-fmt-errorf
track: go
orderIndex: 54
title: Wrapped Sentinel Error Not Matchable
difficulty: medium
tags:
  - errors
  - error-wrapping
  - api-misuse
language: go
---

## Context

The file `internal/store/user.go` defines a repository layer that wraps a PostgreSQL driver. Callers throughout the service check for a well-known sentinel error `ErrNotFound` using `errors.Is` to decide whether to return a 404 vs a 500 to HTTP clients.

After a refactor to improve error messages, callers started receiving 500s for records that simply do not exist. Logs show the error text contains "not found" but the HTTP handler's `errors.Is(err, store.ErrNotFound)` check returns `false`. The database queries themselves are working correctly.

The team verified that `ErrNotFound` is still exported and the callers import the right package. The problem was introduced in the same commit that "improved" the error messages.

## Buggy code

```go
package store

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type UserStore struct{}

func (s *UserStore) GetUser(id int) (*User, error) {
	user, ok := memDB[id]
	if !ok {
		// Improved error message added during refactor
		return nil, fmt.Errorf("user %d: not found", id)
	}
	return user, nil
}

type User struct {
	ID   int
	Name string
}

var memDB = map[int]*User{
	1: {ID: 1, Name: "Alice"},
}
```
