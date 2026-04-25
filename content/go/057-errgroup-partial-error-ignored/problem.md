---
slug: errgroup-partial-error-ignored
track: go
orderIndex: 57
title: ErrGroup First Error Discarded
difficulty: medium
tags:
  - errors
  - goroutines
  - concurrency
  - errgroup
language: go
---

## Context

This file is `internal/sync/pipeline.go`. It runs three independent validation steps concurrently using `golang.org/x/sync/errgroup` and returns the first error encountered. The intent is that if any validator fails the whole pipeline is considered failed.

QA discovered that even when one of the validators returns an error, the pipeline function sometimes returns `nil`. The bug is non-deterministic: it shows up on roughly 30% of test runs where a validator is deliberately injected with a failure. Structured logs confirm the validator goroutine does log its error before returning.

The team verified that each individual `validate*` function returns the correct error and that the `errgroup` package is imported correctly. The issue is in how `Run` collects and returns the group's result.

## Buggy code

```go
package pipeline

import (
	"context"
	"fmt"

	"golang.org/x/sync/errgroup"
)

type Payload struct{ Data string }

func validateSchema(ctx context.Context, p Payload) error  { return nil }
func validateContent(ctx context.Context, p Payload) error { return fmt.Errorf("content invalid") }
func validateAuth(ctx context.Context, p Payload) error    { return nil }

func Run(ctx context.Context, p Payload) error {
	g, ctx := errgroup.WithContext(ctx)

	var firstErr error

	g.Go(func() error {
		if err := validateSchema(ctx, p); err != nil {
			firstErr = err
		}
		return nil
	})
	g.Go(func() error {
		if err := validateContent(ctx, p); err != nil {
			firstErr = err
		}
		return nil
	})
	g.Go(func() error {
		if err := validateAuth(ctx, p); err != nil {
			firstErr = err
		}
		return nil
	})

	if err := g.Wait(); err != nil {
		return err
	}
	return firstErr
}
```
