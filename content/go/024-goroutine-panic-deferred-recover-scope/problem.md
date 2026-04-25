---
slug: goroutine-panic-deferred-recover-scope
track: go
orderIndex: 24
title: Recover Outside Panicking Goroutine
difficulty: hard
tags:
  - goroutines
  - errors
  - concurrency
  - correctness
language: go
---

## Context

This background job runner lives in `internal/jobs/runner.go`. It spawns one goroutine per job and is supposed to recover from panics so a single bad job cannot crash the whole service. The `recover()` call is wrapped in a helper to keep job code clean.

Despite the apparent recovery logic, the service process occasionally crashes with an unhandled panic originating inside one of the job goroutines. On-call engineers have confirmed the panic originates in `runJob`, not in the dispatcher, and the crash always shows `panic: runtime error: index out of range` with no recovery stack frame.

The team verified the `safeRun` helper works correctly in unit tests where it is called directly. They cannot reproduce the crash when calling `safeRun(job)` synchronously, only when jobs are dispatched concurrently.

## Buggy code

```go
package jobs

import (
	"log"
	"sync"
)

type Job struct {
	Name string
	Run  func()
}

func safeRun(job Job) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("recovered panic in job %s: %v", job.Name, r)
		}
	}()
	job.Run()
}

func Dispatch(jobs []Job) {
	var wg sync.WaitGroup
	for _, job := range jobs {
		wg.Add(1)
		go func(j Job) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					log.Printf("dispatcher recovered: %v", r)
				}
			}()
			// Intention: run each job safely. Bug: safeRun is called in a
			// separate goroutine spawned *inside* the job, not in this one.
			go safeRun(j) // <-- extra `go` keyword
		}(job)
	}
	wg.Wait()
}
```
