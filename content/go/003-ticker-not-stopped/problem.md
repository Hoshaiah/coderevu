---
slug: ticker-not-stopped
track: go
orderIndex: 3
title: Ticker Goroutine Never Exits
difficulty: easy
tags:
  - goroutines
  - resource-management
  - context
language: go
---

## Context

This code is in `internal/metrics/reporter.go`. A background reporter goroutine emits heartbeat metrics to a Prometheus push gateway on a fixed interval. It is started once per server lifecycle via `StartReporter` and is supposed to stop when the provided context is cancelled.

Operators see that when a graceful-shutdown signal is sent, memory and goroutine counts don't drop back to baseline. Profiling shows the reporter goroutine is still alive and the `time.Ticker` underlying channel is never garbage-collected. After dozens of rolling deploys on a long-lived host (which reuses the same process via a supervisor), the leak accumulates.

The developer who wrote it thought the goroutine would stop naturally once the context was done because the `select` includes a `ctx.Done()` case.

## Buggy code

```go
package metrics

import (
	"context"
	"log"
	"time"
)

func StartReporter(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				if err := pushMetrics(); err != nil {
					log.Printf("metrics push error: %v", err)
				}
			case <-ctx.Done():
				return
			}
		}
	}()
}

func pushMetrics() error { return nil }
```
