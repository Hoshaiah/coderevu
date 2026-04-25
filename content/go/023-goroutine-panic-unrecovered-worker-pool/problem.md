---
slug: goroutine-panic-unrecovered-worker-pool
track: go
orderIndex: 23
title: Panic Kills Entire Worker Pool
difficulty: hard
tags:
  - goroutines
  - errors
  - concurrency
language: go
---

## Context

This worker pool is in `internal/worker/pool.go` and is used by a document processing service that runs OCR and NLP over uploaded files. Workers read jobs from a shared channel. The pool is long-lived — it is started at service startup and is expected to run for the duration of the process.

The service occasionally crashes completely with a goroutine panic pointing into the NLP library. Individual document failures (malformed PDFs, empty files) are expected and should be isolated to that one job. Instead, the entire service goes down, affecting all in-flight jobs and requiring a manual restart.

The team has error handling at the `processJob` level for expected errors, but the NLP library sometimes panics on unexpected inputs rather than returning an error. The crash happens in production roughly twice a day.

## Buggy code

```go
package worker

import "log"

type Job struct {
	ID      string
	Payload []byte
}

type Pool struct {
	jobs chan Job
}

func NewPool(size int) *Pool {
	p := &Pool{jobs: make(chan Job, 64)}
	for i := 0; i < size; i++ {
		go p.run()
	}
	return p
}

func (p *Pool) Submit(j Job) {
	p.jobs <- j
}

func (p *Pool) run() {
	for job := range p.jobs {
		if err := processJob(job); err != nil {
			log.Printf("job %s failed: %v", job.ID, err)
		}
	}
}

func processJob(j Job) error {
	// calls third-party NLP library that may panic
	_ = j.Payload
	return nil
}
```
