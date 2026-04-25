---
slug: error-group-wrong-context
track: go
orderIndex: 87
title: Cancelled Context Passed to Workers
difficulty: hard
tags:
  - context
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

The function in `internal/batch/processor.go` uses `golang.org/x/sync/errgroup` to process a batch of records concurrently. `errgroup.WithContext` returns both a group and a derived context that is cancelled as soon as any goroutine returns a non-nil error.

The team added a retry wrapper around the whole batch: if any record fails, the entire batch is retried up to three times. On the second and third attempts, workers fail immediately without doing any work. Logs show `context canceled` errors on every task in the retry attempts, even when the underlying operation would have succeeded.

The root context passed into `ProcessBatch` is confirmed to be valid and non-cancelled. The bug only manifests on retry attempts, not on the first try.

## Buggy code

```go
package batch

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func ProcessBatch(ctx context.Context, records []string) error {
	var lastErr error
	eg, egCtx := errgroup.WithContext(ctx)

	for attempt := 0; attempt < 3; attempt++ {
		for _, r := range records {
			rec := r
			eg.Go(func() error {
				return process(egCtx, rec)
			})
		}
		lastErr = eg.Wait()
		if lastErr == nil {
			return nil
		}
	}
	return fmt.Errorf("all attempts failed: %w", lastErr)
}

func process(ctx context.Context, rec string) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	_ = rec
	return nil
}
```
