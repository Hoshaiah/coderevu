---
slug: goroutine-panic-unrecovered-in-worker
track: go
orderIndex: 6
title: Worker Panic Crashes Entire Server
difficulty: easy
tags:
  - goroutines
  - errors
  - correctness
  - panic
language: go
---

## Context

This worker pool lives in `internal/worker/pool.go`. A fixed number of goroutines pick jobs off a channel and process them. Jobs come from untrusted user input and occasionally trigger a panic inside `processJob` (for example, a nil pointer dereference on malformed data). The intent is that a single bad job should be logged and skipped, not crash the service.

On-call engineers report that the entire HTTP server process exits with a stack trace whenever a malformed job is submitted. The crash happens inside a goroutine that has no deferred recovery. The service must restart, causing brief downtime, instead of simply logging the error and moving on.

The team confirmed that `processJob` does not itself recover panics — that is intentional; panic recovery should be the pool's responsibility, not the individual job handler's.

## Buggy code

```go
package worker

import (
	"log"
)

type Job struct {
	ID      int
	Payload []byte
}

func processJob(j Job) error {
	// may panic on malformed input
	_ = j.Payload[0]
	return nil
}

type Pool struct {
	jobs chan Job
}

func NewPool(size int) *Pool {
	p := &Pool{jobs: make(chan Job, 64)}
	for i := 0; i < size; i++ {
		go func() {
			for j := range p.jobs {
				if err := processJob(j); err != nil {
					log.Printf("job %d failed: %v", j.ID, err)
				}
			}
		}()
	}
	return p
}

func (p *Pool) Submit(j Job) {
	p.jobs <- j
}
```
