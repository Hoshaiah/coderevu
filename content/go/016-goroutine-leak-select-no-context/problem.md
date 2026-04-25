---
slug: goroutine-leak-select-no-context
track: go
orderIndex: 16
title: Goroutine Leaks Without Context Check
difficulty: medium
tags:
  - goroutines
  - context
  - concurrency
  - leaks
language: go
---

## Context

This code lives in `internal/poller/poller.go`, a background service that polls a remote API for status updates on long-running jobs. Each call to `PollUntilDone` is expected to block until the job finishes or the caller cancels the context. The function is called from an HTTP handler that passes a request-scoped context.

Operators noticed that after clients disconnect mid-request, memory and goroutine counts climb steadily. After a load test where many clients connected and immediately disconnected, `pprof` showed hundreds of goroutines stuck in `PollUntilDone` — long after the originating HTTP requests had returned 499s.

The team already confirmed the HTTP handler correctly cancels the context when the client disconnects, and the ticker is being stopped. The leak must be inside `PollUntilDone` itself.

## Buggy code

```go
package poller

import (
	"context"
	"time"
)

type Status struct {
	Done bool
	Result string
}

func fetchStatus(jobID string) (Status, error) {
	// calls remote API
	return Status{}, nil
}

func PollUntilDone(ctx context.Context, jobID string, interval time.Duration) (Status, error) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	resultCh := make(chan Status)

	go func() {
		for range ticker.C {
			status, err := fetchStatus(jobID)
			if err != nil {
				continue
			}
			if status.Done {
				resultCh <- status
				return
			}
		}
	}()

	select {
	case status := <-resultCh:
		return status, nil
	case <-ctx.Done():
		return Status{}, ctx.Err()
	}
}
```
