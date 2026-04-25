---
slug: channel-send-after-close
track: go
orderIndex: 31
title: Send on Closed Channel Panic
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This file is `pkg/pipeline/merge.go`, part of a data-ingestion pipeline. A supervisor goroutine collects errors from worker goroutines via a shared error channel and returns the first one. Each worker sends at most one error.

In production the service panics intermittently with `send on closed channel`. The panic appears in the goroutine stack trace at the line `errc <- err` inside a worker. It happens rarely — usually only when two or more workers fail within microseconds of each other under high-throughput conditions.

The team added a recover shim to suppress the panic as a temporary measure, but the underlying race is still there and they want it fixed properly.

## Buggy code

```go
package pipeline

import (
	"context"
	"fmt"
)

func RunWorkers(ctx context.Context, n int) error {
	errc := make(chan error, n)

	for i := 0; i < n; i++ {
		i := i
		go func() {
			if err := doWork(ctx, i); err != nil {
				errc <- fmt.Errorf("worker %d: %w", i, err)
			}
		}()
	}

	for i := 0; i < n; i++ {
		if err := <-errc; err != nil {
			close(errc)
			return err
		}
	}
	return nil
}

func doWork(ctx context.Context, id int) error { return nil }
```
