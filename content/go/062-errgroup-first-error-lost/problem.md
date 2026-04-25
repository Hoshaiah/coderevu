---
slug: errgroup-first-error-lost
track: go
orderIndex: 62
title: First Error Lost Before Wait
difficulty: medium
tags:
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

This ETL job lives in `jobs/transform.go`. It uses `errgroup` to run multiple transformation steps in parallel. If any step fails the job is supposed to abort and return the first error to the scheduler.

In staging the scheduler logs show the job returning `nil` even after a transformation step fails visibly in its own log output. The error is never propagated to the caller. Downstream data validation then fails hours later when the bad output is consumed.

The team added debug logging and confirmed the individual step error is non-nil at the point it is returned from the goroutine. They have not yet inspected how `errgroup.Wait` is being used.

## Buggy code

```go
package jobs

import (
	"context"
	"fmt"
	"golang.org/x/sync/errgroup"
)

type Step func(ctx context.Context) error

func RunTransforms(ctx context.Context, steps []Step) error {
	g, gctx := errgroup.WithContext(ctx)

	for _, step := range steps {
		s := step
		g.Go(func() error {
			return s(gctx)
		})
	}

	if err := g.Wait(); err != nil {
		fmt.Printf("transform error: %v\n", err)
	}
	return nil
}
```
