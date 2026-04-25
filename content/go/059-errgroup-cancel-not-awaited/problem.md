---
slug: errgroup-cancel-not-awaited
track: go
orderIndex: 59
title: errgroup Wait Never Called
difficulty: medium
tags:
  - errors
  - goroutines
  - context
language: go
---

## Context

This function is in `internal/pipeline/stage.go`. It fans out work to N workers using `golang.org/x/sync/errgroup`, then collects results. It is part of a data transformation pipeline where each stage must fully complete before the next begins.

In production, the pipeline occasionally produces incomplete output — some records are missing — with no error logged. CPU profiles show the function returning while worker goroutines are still running in the background, writing to a slice that the next stage is already reading.

The team confirmed the `errgroup` import is correct and that individual workers do return errors when they encounter bad records.

## Buggy code

```go
package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Record struct{ ID int }

func RunStage(ctx context.Context, inputs []Record, process func(Record) (Record, error)) ([]Record, error) {
	g, gctx := errgroup.WithContext(ctx)
	results := make([]Record, len(inputs))

	for i, rec := range inputs {
		i, rec := i, rec
		g.Go(func() error {
			out, err := process(rec)
			if err != nil {
				return fmt.Errorf("record %d: %w", rec.ID, err)
			}
			results[i] = out
			return nil
		})
	}

	if err := gctx.Err(); err != nil {
		return nil, err
	}

	return results, nil
}
```
