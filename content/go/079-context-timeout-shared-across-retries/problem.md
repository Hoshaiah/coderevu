---
slug: context-timeout-shared-across-retries
track: go
orderIndex: 79
title: Timeout Shared Across All Retries
difficulty: medium
tags:
  - context
  - errors
  - correctness
language: go
---

## Context

This retry helper lives in `pkg/httpclient/retry.go`. It wraps an HTTP-like `do` function with a simple retry loop: it creates a per-attempt timeout and retries up to `maxAttempts` times on transient errors. The timeout is meant to apply to each individual attempt, not to the whole retry sequence.

In production, the second and later retries almost always fail immediately with `context deadline exceeded` even when the upstream service recovered quickly after the first failure. Monitoring shows the first attempt consumes the full timeout, and subsequent attempts get a context that is already expired or nearly expired.

Engineers added logging and confirmed that the `do` function itself correctly respects context cancellation. The problem is clearly in how the context is created for each attempt.

## Buggy code

```go
package httpclient

import (
	"context"
	"errors"
	"time"
)

var ErrTransient = errors.New("transient")

func do(ctx context.Context) error { return ErrTransient }

func DoWithRetry(parent context.Context, maxAttempts int, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	var lastErr error
	for i := 0; i < maxAttempts; i++ {
		err := do(ctx)
		if err == nil {
			return nil
		}
		if !errors.Is(err, ErrTransient) {
			return err
		}
		lastErr = err
	}
	return lastErr
}
```
