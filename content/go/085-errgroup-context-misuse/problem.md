---
slug: errgroup-context-misuse
track: go
orderIndex: 85
title: Errgroup Context Used After Cancel
difficulty: hard
tags:
  - context
  - errors
  - goroutines
language: go
---

## Context

This code is in `service/batch.go` and uses `golang.org/x/sync/errgroup` to process a batch of records concurrently. The `errgroup` provides a context that is cancelled when any goroutine returns a non-nil error. A database connection is created once and shared across all workers via that context.

Under normal conditions the batch completes quickly. When one worker hits a transient DB error, subsequent workers that are still running start failing with `context canceled` errors and the whole batch is retried unnecessarily. The developer expected only the failing record to be retried, not the entire batch.

The team looked at errgroup documentation and confirmed they are using `errgroup.WithContext` correctly for cancellation. They have not yet noticed that the shared resource setup also uses the errgroup context.

## Buggy code

```go
package batch

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Record struct{ ID int }

func ProcessBatch(ctx context.Context, records []Record) error {
	g, gCtx := errgroup.WithContext(ctx)

	conn, err := openDBConn(gCtx)
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer conn.Close()

	for _, rec := range records {
		rec := rec
		g.Go(func() error {
			return processRecord(gCtx, conn, rec)
		})
	}
	return g.Wait()
}

func openDBConn(ctx context.Context) (*DBConn, error) { return &DBConn{}, nil }
func processRecord(ctx context.Context, conn *DBConn, rec Record) error {
	return conn.Exec(ctx, fmt.Sprintf("process %d", rec.ID))
}

type DBConn struct{}

func (c *DBConn) Exec(ctx context.Context, q string) error { return nil }
func (c *DBConn) Close()                                   {}
```
