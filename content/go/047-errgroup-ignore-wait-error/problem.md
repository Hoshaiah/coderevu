---
slug: errgroup-ignore-wait-error
track: go
orderIndex: 47
title: errgroup Wait Error Ignored
difficulty: easy
tags:
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

This function is in `internal/pipeline/stage.go`. It uses `golang.org/x/sync/errgroup` to fan out a batch of work items to multiple goroutines and collects their results. The expectation is that if any item fails to process, the overall function returns an error so the caller can retry or alert.

In production, failures inside individual `process` calls are logged but the HTTP handler that calls `RunBatch` never returns a non-200 status. The Sentry error tracker shows panics in downstream services that receive malformed output, but `RunBatch` itself never returns an error. Engineers added log lines and confirmed that worker goroutines do return errors.

The function was recently refactored from a manual `WaitGroup` approach to `errgroup` to simplify error collection, but something was lost in the translation.

## Buggy code

```go
package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func RunBatch(ctx context.Context, items []string, process func(string) error) error {
	g, ctx := errgroup.WithContext(ctx)

	for _, item := range items {
		item := item
		g.Go(func() error {
			if err := process(item); err != nil {
				return fmt.Errorf("process %q: %w", item, err)
			}
			return nil
		})
	}

	g.Wait() // nolint:errcheck
	return nil
}
```
