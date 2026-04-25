---
slug: goroutine-panic-unrecovered
track: go
orderIndex: 13
title: Panic in Goroutine Crashes Server
difficulty: medium
tags:
  - goroutines
  - errors
  - panic-recovery
language: go
---

## Context

The file `internal/worker/dispatcher.go` runs background jobs submitted by an HTTP API. Each job is executed in its own goroutine so the API can return immediately. The dispatcher is part of a long-running server process that is expected to stay up indefinitely.

On rare occasions the entire server process crashes with a `panic` printed to stderr. Post-mortem analysis shows the panic originates inside `runJob` (a third-party callback the dispatcher does not control), and because it happens inside a goroutine that has no `recover`, it brings down the whole process. The HTTP server and all healthy goroutines die with it.

The team already added `recover` in the main goroutine, but panics in spawned goroutines are not covered by that. The fix must ensure a panic in any job goroutine is caught and logged without crashing the process.

## Buggy code

```go
package worker

import (
	"log"
	"sync"
)

type Job struct {
	ID  string
	Fn  func() error
}

type Dispatcher struct {
	wg sync.WaitGroup
}

func (d *Dispatcher) Submit(job Job) {
	d.wg.Add(1)
	go func() {
		defer d.wg.Done()
		if err := job.Fn(); err != nil {
			log.Printf("job %s failed: %v", job.ID, err)
		}
	}()
}

func (d *Dispatcher) Wait() {
	d.wg.Wait()
}
```
