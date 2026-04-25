---
slug: channel-pipeline-slow-consumer-drop
track: go
orderIndex: 43
title: Pipeline Drops Items on Slow Consumer
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This pipeline lives in `internal/metrics/pipeline.go` and is responsible for aggregating metric events before forwarding them to a time-series database. The producer emits up to 50,000 events per second; the consumer flushes batches to the DB every 100ms. A buffered channel is used as the queue between them.

In production the metrics database shows gaps: event counts are lower than expected, sometimes by 30–40%. No errors are logged. The producer is confirmed to be emitting the correct number of events. The consumer's flush logs show it processes whatever is in the channel but never logs a full batch.

The team has already verified that the DB writes themselves are not failing. They suspect events are being lost before they even reach the consumer.

## Buggy code

```go
package metrics

import (
	"context"
	"log"
	"time"
)

type Event struct {
	Name  string
	Value float64
}

func StartPipeline(ctx context.Context, flush func([]Event)) chan<- Event {
	ch := make(chan Event, 256)

	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		var batch []Event

		for {
			select {
			case <-ctx.Done():
				if len(batch) > 0 {
					flush(batch)
				}
				return
			case <-ticker.C:
				if len(batch) > 0 {
					flush(batch)
					batch = nil
				}
			case e := <-ch:
				batch = append(batch, e)
			}
		}
	}()

	return ch
}

func Emit(ch chan<- Event, e Event) {
	select {
	case ch <- e:
	default:
		log.Printf("dropping event %s: channel full", e.Name)
	}
}
```
