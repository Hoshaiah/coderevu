---
slug: loop-var-capture
track: go
orderIndex: 1
title: "Goroutines all print the same final value"
difficulty: easy
tags: [goroutines, closures, concurrency]
language: go
---

## Context

This worker function is supposed to process each job concurrently and log which job it picked up. In Go 1.21 the logs show all goroutines claiming to process the *last* job. The team is on Go 1.21 (not yet upgraded to 1.22). Fix it without relying on the Go 1.22 loop-variable change.

## Buggy code

```go
package worker

import (
	"log"
	"sync"
)

type Job struct {
	ID   int
	Body string
}

func Dispatch(jobs []Job) {
	var wg sync.WaitGroup
	for _, job := range jobs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			log.Printf("processing job %d", job.ID)
			process(job)
		}()
	}
	wg.Wait()
}

func process(j Job) { /* ... */ }
```
