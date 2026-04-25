---
slug: goroutine-leak-abandoned-worker
track: go
orderIndex: 10
title: Abandoned Worker Goroutine on Shutdown
difficulty: easy
tags:
  - goroutines
  - channels
  - context
  - concurrency
language: go
---

## Context

This background worker lives in `internal/ingest/worker.go` and is started once at application boot. It reads records from an upstream channel and writes them to a database. The surrounding service is a data-ingestion API that also handles graceful shutdown via an OS signal handler.

Operators noticed that during rolling deploys the process sometimes hangs for 30+ seconds before the OS kills it, even though a 5-second shutdown deadline is configured. Profiling revealed dozens of goroutines stuck inside `runWorker` long after the main context was cancelled.

The team already verified that the upstream `records` channel is never closed by the producer — it is intentionally long-lived and reused across restarts. The shutdown signal correctly cancels the passed context, so context propagation is not the issue.

## Buggy code

```go
package ingest

import (
	"context"
	"log"
)

type Record struct {
	ID   int
	Data []byte
}

func runWorker(records <-chan Record, save func(Record) error) {
	for rec := range records {
		if err := save(rec); err != nil {
			log.Printf("save failed: %v", err)
		}
	}
}

func StartWorkers(ctx context.Context, n int, records <-chan Record, save func(Record) error) {
	for i := 0; i < n; i++ {
		go runWorker(records, save)
	}
	<-ctx.Done()
	log.Println("shutdown signal received")
}
```
