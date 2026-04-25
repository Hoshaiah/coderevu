---
slug: error-wrap-nil-interface
track: go
orderIndex: 52
title: Nil Error Becomes Non-Nil Interface
difficulty: medium
tags:
  - errors
  - correctness
  - interfaces
language: go
---

## Context

This is `store/db.go`, a thin wrapper around database calls in a microservice. The `QueryUser` function returns a custom error type `*DBError` when a database-level failure occurs, and `nil` when the call succeeds. The caller checks `if err != nil` to decide whether to return a 500 to the client.

Users report receiving spurious 500 responses even when the database query succeeds. Adding log lines shows that `QueryUser` returns without hitting any error path, yet the caller's `err != nil` check evaluates to `true`. The bug reproduces consistently in the success path.

A teammate who investigated noted that when they changed the return type of `QueryUser` from `*DBError` to `error` in the signature, the spurious 500s disappeared — but they weren't sure why.

## Buggy code

```go
package store

import "fmt"

type DBError struct {
	Code    int
	Message string
}

func (e *DBError) Error() string {
	return fmt.Sprintf("db error %d: %s", e.Code, e.Message)
}

func queryDB(userID int) *DBError {
	// returns nil on success
	if userID <= 0 {
		return &DBError{Code: 400, Message: "invalid user id"}
	}
	return nil
}

func QueryUser(userID int) error {
	var dbErr *DBError = queryDB(userID)
	return dbErr
}

func HandleRequest(userID int) string {
	if err := QueryUser(userID); err != nil {
		return fmt.Sprintf("error: %v", err)
	}
	return "ok"
}
```
