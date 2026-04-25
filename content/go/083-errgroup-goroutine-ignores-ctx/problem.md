---
slug: errgroup-goroutine-ignores-ctx
track: go
orderIndex: 83
title: Goroutine Ignores errgroup Context
difficulty: medium
tags:
  - context
  - errors
  - goroutines
language: go
---

## Context

This function lives in `internal/ingest/parallel.go` and is called by a batch ingestion job that reads records from S3 and writes them to a database in parallel. It uses `golang.org/x/sync/errgroup` for structured concurrency. If any worker fails, the others should stop early to avoid wasting resources.

Operators observe that when the database is unavailable, the job takes the full configured timeout (30 minutes) to fail rather than stopping quickly. CPU and network usage remain high for the entire duration even after the first error is logged.

The team confirmed that `errgroup.WithContext` is being used and that the first failing goroutine does return an error. The issue is that the remaining goroutines do not observe the cancellation.

## Buggy code

```go
package ingest

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

func ProcessRecords(ctx context.Context, records []string, store func(string) error) error {
	g, gCtx := errgroup.WithContext(ctx)
	_ = gCtx // derived context available but unused

	for _, rec := range records {
		rec := rec
		g.Go(func() error {
			// Long-running work that should respect cancellation
			for i := 0; i < 10; i++ {
				if err := store(rec); err != nil {
					return fmt.Errorf("store %q: %w", rec, err)
				}
			}
			return nil
		})
	}

	return g.Wait()
}
```
