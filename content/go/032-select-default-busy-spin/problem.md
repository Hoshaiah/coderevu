---
slug: select-default-busy-spin
track: go
orderIndex: 32
title: Default Case Causes Busy-Spin
difficulty: medium
tags:
  - channels
  - goroutines
  - performance
language: go
---

## Context

This worker is in `cmd/processor/main.go`. It reads jobs from a channel and processes them, with a separate channel used to signal shutdown. The developer added a `default` case to avoid blocking so the goroutine could do periodic bookkeeping between jobs.

In production, CPU usage on the worker node is pinned at 100% even when the job channel is empty. The service processes jobs correctly, but the host is otherwise unresponsive. Removing the worker process immediately frees the CPU. Adding `GOMAXPROCS=1` doesn't help — one full core is always consumed.

The developer tried adding a `time.Sleep(1 * time.Millisecond)` in the default branch as a workaround. CPU usage dropped but jobs now have artificial latency. They want the goroutine to block efficiently when there is no work.

## Buggy code

```go
package main

import (
	"log"
)

type Job struct{ ID int }

func worker(jobs <-chan Job, quit <-chan struct{}) {
	for {
		select {
		case j, ok := <-jobs:
			if !ok {
				return
			}
			process(j)
		case <-quit:
			return
		default:
			// no work available, do bookkeeping
			doBookkeeping()
		}
	}
}

func process(j Job) { log.Printf("processing %d", j.ID) }
func doBookkeeping()  { /* lightweight check */ }
func main()           {}
```
