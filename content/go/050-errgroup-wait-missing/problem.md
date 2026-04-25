---
slug: errgroup-wait-missing
track: go
orderIndex: 50
title: errgroup Wait Never Called
difficulty: easy
tags:
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

This function is in `internal/export/batch.go`. It exports a batch of records to three downstream systems in parallel using `golang.org/x/sync/errgroup`. The results are collected into a slice and returned to the caller, which then writes them to a response payload.

Callers intermittently receive empty or partial result slices even when all three exports succeed. Adding log statements shows that all three goroutines eventually finish and append their results, but by the time the caller inspects the slice, it is sometimes empty.

The team verified that the slice append operations are protected against concurrent writes (each goroutine writes to a pre-allocated index) and that the individual export functions themselves are correct.

## Buggy code

```go
package export

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Result struct {
	System string
	Count  int
}

func ExportAll(ctx context.Context, data []byte) ([]Result, error) {
	results := make([]Result, 3)

	g, gctx := errgroup.WithContext(ctx)

	g.Go(func() error {
		n, err := exportToSystemA(gctx, data)
		if err != nil {
			return fmt.Errorf("system A: %w", err)
		}
		results[0] = Result{System: "A", Count: n}
		return nil
	})

	g.Go(func() error {
		n, err := exportToSystemB(gctx, data)
		if err != nil {
			return fmt.Errorf("system B: %w", err)
		}
		results[1] = Result{System: "B", Count: n}
		return nil
	})

	g.Go(func() error {
		n, err := exportToSystemC(gctx, data)
		if err != nil {
			return fmt.Errorf("system C: %w", err)
		}
		results[2] = Result{System: "C", Count: n}
		return nil
	})

	return results, nil
}

func exportToSystemA(ctx context.Context, data []byte) (int, error) { return len(data), nil }
func exportToSystemB(ctx context.Context, data []byte) (int, error) { return len(data), nil }
func exportToSystemC(ctx context.Context, data []byte) (int, error) { return len(data), nil }
```
