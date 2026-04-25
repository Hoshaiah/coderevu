---
slug: channel-close-in-wrong-goroutine
track: go
orderIndex: 41
title: Producer Close Races Multiple Senders
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
  - panic
language: go
---

## Context

This code is in `internal/ingest/fanin.go`, a fan-in collector used by a data-ingestion pipeline. Multiple worker goroutines each fetch a page of records from an external API and send the results onto a shared channel; a downstream consumer drains that channel. The function `Collect` is supposed to wait for all workers to finish, then close the results channel so the consumer's `range` loop terminates cleanly.

The service runs fine under low load but intermittently panics in production with `send on closed channel`. The panic appears randomly in one of the worker goroutines, not always the same one. It only manifests when two or more workers happen to finish very close together.

The team already verified that each individual worker goroutine sends correctly and that the context is propagated properly. The issue is in how the channel is closed relative to the workers' sends.

## Buggy code

```go
package ingest

import (
	"context"
	"sync"
)

type Record struct {
	ID   int
	Data string
}

func fetchPage(ctx context.Context, page int) ([]Record, error) {
	return nil, nil
}

func Collect(ctx context.Context, pages int) <-chan Record {
	results := make(chan Record, 64)
	var wg sync.WaitGroup

	for i := 0; i < pages; i++ {
		wg.Add(1)
		go func(page int) {
			records, err := fetchPage(ctx, page)
			if err == nil {
				for _, r := range records {
					results <- r
				}
			}
			wg.Done()
			wg.Wait()  // every worker waits for all others
			close(results)
		}(i)
	}

	return results
}
```
