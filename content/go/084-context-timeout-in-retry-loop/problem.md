---
slug: context-timeout-in-retry-loop
track: go
orderIndex: 84
title: "Context Timeout Consumed by Retries"
difficulty: medium
tags: ["context", "errors", "correctness"]
language: go
---

## Context

This helper lives in `internal/rpc/client.go` and wraps an RPC call with a simple retry loop. The intent is that each attempt gets a fresh short timeout so a slow server cannot block the entire retry budget. Callers pass their own parent context (which may already have a deadline set by a higher-level handler).

In production, callers observe that after the first timeout the function immediately returns a deadline-exceeded error without ever retrying — even when `maxRetries` is set to 5. The retry counter in the logs never goes above 1.

The team confirmed that the RPC endpoint itself is healthy and that individual calls succeed in < 100 ms under normal conditions. The parent context passed by callers always has a deadline of 10 seconds, well above the per-attempt timeout of 2 seconds.

## Buggy code

```go
package rpc

import (
	"context"
	"errors"
	"fmt"
	"time"
)

const (
	attemptTimeout = 2 * time.Second
	maxRetries     = 5
)

func callWithRetry(ctx context.Context, call func(context.Context) error) error {
	ctx, cancel := context.WithTimeout(ctx, attemptTimeout)
	defer cancel()

	var lastErr error
	for i := 0; i < maxRetries; i++ {
		if err := call(ctx); err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				lastErr = err
				continue
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("all %d attempts failed: %w", maxRetries, lastErr)
}
```
