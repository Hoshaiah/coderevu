---
slug: goroutine-wg-reuse-race
track: go
orderIndex: 19
title: WaitGroup Reused Before Done
difficulty: hard
tags:
  - goroutines
  - concurrency
  - channels
language: go
---

## Context

This code is in `internal/batch/processor.go`. A `Processor` struct is designed to be reused across multiple batches: call `Submit` for each item, then call `Flush` to wait for all of them to finish, then repeat for the next batch. This pattern is used by an ETL pipeline that processes records in chunks of 500.

The ETL job occasionally panics with `sync: WaitGroup is reused before previous Wait has returned` deep in the runtime, but only when batch sizes are large and the machine is under CPU pressure. The panic is non-deterministic and has never been reproduced locally, only in staging.

The team knows that `sync.WaitGroup` must not be copied, and they confirmed they are not copying it. They suspect a race between batches but have not identified the exact sequence.

## Buggy code

```go
package batch

import "sync"

type Processor struct {
	wg      sync.WaitGroup
	workers int
	semCh   chan struct{}
}

func NewProcessor(workers int) *Processor {
	return &Processor{
		workers: workers,
		semCh:   make(chan struct{}, workers),
	}
}

func (p *Processor) Submit(task func()) {
	p.wg.Add(1)
	p.semCh <- struct{}{}
	go func() {
		defer func() {
			<-p.semCh
			p.wg.Done()
		}()
		task()
	}()
}

func (p *Processor) Flush() {
	p.wg.Wait()
}
```
