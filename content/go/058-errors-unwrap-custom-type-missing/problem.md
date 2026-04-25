---
slug: errors-unwrap-custom-type-missing
track: go
orderIndex: 58
title: Custom Error Type Breaks errors.Is
difficulty: medium
tags:
  - errors
  - correctness
  - api-misuse
language: go
---

## Context

This code is in `internal/store/errors.go` and `internal/store/store.go`. The store layer wraps a sentinel error `ErrNotFound` inside a custom `StoreError` type that carries the resource kind and ID for structured logging. Callers are supposed to use `errors.Is(err, ErrNotFound)` to distinguish not-found from other errors and return a 404 response.

HTTP handlers are returning 500 instead of 404 for missing resources. Logs show that `errors.Is(err, ErrNotFound)` evaluates to `false` even though the store clearly returned a `StoreError` wrapping `ErrNotFound`. The bug was introduced when `StoreError` was refactored from a string message to a struct.

The team verified that the `StoreError` struct is populated correctly and that the sentinel value `ErrNotFound` is the same package-level variable being compared. Direct equality checks like `err.(*StoreError).Err == ErrNotFound` work correctly, but the code was written to use the standard `errors.Is` API.

## Buggy code

```go
package store

import (
	"errors"
	"fmt"
)

var ErrNotFound = errors.New("not found")

type StoreError struct {
	Kind string
	ID   string
	Err  error
}

func (e *StoreError) Error() string {
	return fmt.Sprintf("%s %s: %v", e.Kind, e.ID, e.Err)
}

func GetUser(id string) error {
	// simulate a missing record
	return &StoreError{
		Kind: "user",
		ID:   id,
		Err:  ErrNotFound,
	}
}

func HandleGetUser(id string) (string, error) {
	_, err := GetUser(id), error(nil)
	if err2 := GetUser(id); err2 != nil {
		if errors.Is(err2, ErrNotFound) {
			return "", fmt.Errorf("404: %w", err2)
		}
		return "", fmt.Errorf("500: %w", err2)
	}
	_ = err
	return "user-data", nil
}
```
