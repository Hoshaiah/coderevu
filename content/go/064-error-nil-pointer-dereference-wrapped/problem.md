---
slug: error-nil-pointer-dereference-wrapped
track: go
orderIndex: 64
title: Nil Pointer Inside Non-Nil Error
difficulty: medium
tags:
  - errors
  - interfaces
  - correctness
language: go
---

## Context

This snippet is from `pkg/storage/client.go`, a thin wrapper around a third-party object-storage SDK. The `Upload` function returns a typed error when a quota is exceeded so callers can distinguish quota failures from network failures. The rest of the codebase checks for this via `errors.As`.

Despite the error-wrapping logic, callers report that `errors.As(err, &QuotaErr{})` returns false even when upload fails with a quota error. Adding debug logs shows the returned `err` is not nil — it has a non-nil dynamic type — yet calling `.Error()` on the returned value panics with a nil pointer dereference.

The team already ruled out the SDK itself: the raw error it returns is correctly populated. The issue is entirely inside the wrapper logic below.

## Buggy code

```go
package storage

import (
	"fmt"
)

// QuotaError is returned when the storage quota is exceeded.
type QuotaError struct {
	Limit int64
	Used  int64
}

func (e *QuotaError) Error() string {
	return fmt.Sprintf("quota exceeded: used %d of %d bytes", e.Used, e.Limit)
}

// sdkUpload simulates the third-party SDK.
func sdkUpload(data []byte) error {
	if len(data) > 1000 {
		return &QuotaError{Limit: 1000, Used: int64(len(data))}
	}
	return nil
}

func Upload(data []byte) error {
	var quotaErr *QuotaError

	if err := sdkUpload(data); err != nil {
		if ok := isQuotaError(err, quotaErr); ok {
			return quotaErr
		}
		return fmt.Errorf("upload failed: %w", err)
	}
	return nil
}

func isQuotaError(err error, out *QuotaError) bool {
	target, ok := err.(*QuotaError)
	if ok {
		out = target
	}
	return ok
}
```
