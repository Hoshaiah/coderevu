---
slug: error-sentinel-type-switch-miss
track: go
orderIndex: 68
title: Sentinel Error Missed in Type Switch
difficulty: hard
tags:
  - errors
  - correctness
  - api-misuse
language: go
---

## Context

This retry logic is in `internal/rpc/retry.go`. The caller is supposed to retry on transient errors but immediately return on permanent errors (e.g. `ErrNotFound`). A `switch` on the error type is used to distinguish them.

In production the service retries `ErrNotFound` responses three times before giving up, causing unnecessary latency and log spam. The RPC layer wraps errors with `fmt.Errorf("%w", err)` before returning them, which is documented in the RPC package's README.

The team looked at the retry loop and believes the `switch` is correct because `ErrNotFound` is a distinct type. They have not considered how wrapping interacts with a direct type switch.

## Buggy code

```go
package rpc

import (
	"errors"
	"fmt"
	"time"
)

var ErrNotFound = errors.New("not found")

type TransientError struct{ Msg string }

func (e *TransientError) Error() string { return e.Msg }

func callWithRetry(call func() error) error {
	for attempt := 0; attempt < 3; attempt++ {
		err := call()
		if err == nil {
			return nil
		}
		switch err.(type) {
		case *TransientError:
			time.Sleep(100 * time.Millisecond)
			continue
		default:
			// treat as permanent, including ErrNotFound
			return err
		}
	}
	return fmt.Errorf("max retries exceeded")
}
```
