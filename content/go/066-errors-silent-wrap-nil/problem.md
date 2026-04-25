---
slug: errors-silent-wrap-nil
track: go
orderIndex: 66
title: Wrapped Nil Error Becomes Non-Nil
difficulty: medium
tags:
  - errors
  - api-misuse
  - correctness
language: go
---

## Context

This middleware lives in `internal/db/retry.go` and wraps database calls with automatic retry logic for transient connection errors. It is used by every repository layer in the service and is considered foundational infrastructure.

Callers intermittently report that `errors.Is(err, ErrNotFound)` returns `false` even when the record is genuinely absent. Adding log statements shows the error returned is not `nil` even on the successful-retry path, and the string representation is an empty-looking `"operation failed: <nil>"`. Callers using `if err != nil` to gate further processing proceed even when no real error occurred.

The team checked that `ErrNotFound` is defined as a sentinel and that the repository functions return it correctly. They've ruled out context cancellation and confirmed the retry loop itself terminates as expected.

## Buggy code

```go
package db

import (
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("not found")

type opFunc func() error

func withRetry(op opFunc, maxAttempts int) error {
	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		if i > 0 {
			time.Sleep(time.Duration(i*100) * time.Millisecond)
		}
		lastErr = op()
		if lastErr == nil {
			break
		}
		if !isTransient(lastErr) {
			break
		}
	}
	return fmt.Errorf("operation failed: %w", lastErr)
}

func isTransient(err error) bool {
	// checks for connection reset, timeout, etc.
	return false
}
```
