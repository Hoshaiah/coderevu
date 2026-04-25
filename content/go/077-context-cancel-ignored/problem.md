---
slug: context-cancel-ignored
track: go
orderIndex: 77
title: Context cancellation leak causes goroutines to accumulate over time
difficulty: medium
tags:
  - context
  - goroutine-leak
  - resource-management
  - cancellation
language: go
---

## Context

This function polls a job queue in a background worker. Each call to `pollOnce` is wrapped in a per-attempt context with a timeout. Over several hours of operation, the number of goroutines reported by `runtime.NumGoroutine()` climbs steadily even when there is no load, and eventually the process runs out of memory.

## Buggy code

```go
package worker

import (
	"context"
	"time"
)

type Job struct{ ID int }

func pollOnce(parent context.Context, fetch func(context.Context) ([]Job, error)) ([]Job, error) {
	ctx, _ := context.WithTimeout(parent, 5*time.Second)
	return fetch(ctx)
}

func RunWorker(ctx context.Context, fetch func(context.Context) ([]Job, error)) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			jobs, err := pollOnce(ctx, fetch)
			if err != nil || len(jobs) == 0 {
				continue
			}
			for _, j := range jobs {
				process(j)
			}
		}
	}
}

func process(j Job) {}
```
