---
slug: goroutine-spawn-rate-unlimited
track: go
orderIndex: 20
title: Unbounded Goroutine Spawn Under Load
difficulty: hard
tags:
  - goroutines
  - concurrency
  - resource-management
language: go
---

## Context

This is `internal/worker/dispatcher.go`. It reads tasks from a queue channel and spawns a goroutine per task to call a remote API. Under normal load (< 100 tasks/sec) it performs well. The service is deployed with a 512 MB memory limit.

During a traffic spike the service OOMs and is killed by the container orchestrator. A post-mortem heap dump showed millions of goroutines alive simultaneously, each holding HTTP response buffers. The team had assumed the remote API's latency would naturally bound concurrency.

The team ruled out a memory leak in individual goroutines. They confirmed the queue channel is being filled faster than the remote API can respond.

## Buggy code

```go
package worker

import (
	"context"
	"log"
)

type Task struct {
	ID      int
	Payload string
}

func Dispatch(ctx context.Context, tasks <-chan Task, callAPI func(context.Context, Task) error) {
	for {
		select {
		case <-ctx.Done():
			return
		case task, ok := <-tasks:
			if !ok {
				return
			}
			go func(t Task) {
				if err := callAPI(ctx, t); err != nil {
					log.Printf("task %d failed: %v", t.ID, err)
				}
			}(task)
		}
	}
}
```
