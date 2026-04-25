---
slug: goroutine-wg-done-before-send
track: go
orderIndex: 22
title: WaitGroup Done Called Too Early
difficulty: hard
tags:
  - goroutines
  - channels
  - concurrency
language: go
---

## Context

This aggregation worker is in `internal/agg/worker.go`. It fans out work to goroutines and collects results through a results channel. A collector goroutine reads from the channel until it is closed. The `WaitGroup` is used to know when all workers are done so the results channel can be safely closed.

Sometimes the collector processes fewer results than expected. Occasionally results are lost entirely. The bug is timing-sensitive and does not reproduce under the race detector without a specifically crafted load pattern.

The team has ruled out the collector being slow. They are focused on the worker goroutines and the order in which they signal completion.

## Buggy code

```go
package agg

import "sync"

type Result struct {
	WorkerID int
	Value    int
}

func Aggregate(workerCount int, work func(id int) int) []Result {
	results := make(chan Result, workerCount)
	var wg sync.WaitGroup

	wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		id := i
		go func() {
			wg.Done() // signal completion before sending result
			v := work(id)
			results <- Result{WorkerID: id, Value: v}
		}()
	}

	go func() {
		wg.Wait()
		close(results)
	}()

	var out []Result
	for r := range results {
		out = append(out, r)
	}
	return out
}
```
