---
slug: goroutine-leak-ticker-no-stop
track: go
orderIndex: 8
title: Ticker Goroutine Never Exits
difficulty: easy
tags:
  - goroutines
  - concurrency
  - resource-management
language: go
---

## Context

This function lives in `internal/metrics/reporter.go` inside a long-running service. It spawns a background goroutine that periodically flushes in-memory counters to a remote metrics endpoint. It is called once per HTTP server startup from `main.go`.

The service runs fine initially, but after several deployments operators notice the process memory grows slowly over hours. A `pprof` goroutine dump shows hundreds of `startReporter` goroutines still running from previous calls, each holding a reference to a `Ticker`.

The team confirmed that `startReporter` is only called once at startup, so the growth must come from integration tests that call it in a loop without proper cleanup. The real fix, though, is ensuring the goroutine respects a shutdown signal.

## Buggy code

```go
package metrics

import (
	"context"
	"log"
	"time"
)

func startReporter(ctx context.Context, flush func()) {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		for {
			select {
			case <-ticker.C:
				flush()
				log.Println("metrics flushed")
			}
		}
	}()
}
```
