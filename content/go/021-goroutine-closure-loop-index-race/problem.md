---
slug: goroutine-closure-loop-index-race
track: go
orderIndex: 21
title: Concurrent Writes to Shared Slice Index
difficulty: hard
tags:
  - goroutines
  - concurrency
  - errors
language: go
---

## Context

This function is in `internal/transform/parallel.go`. It applies a transformation to each element of a slice in parallel and collects results back into a pre-allocated output slice. It is called by a report generator that processes thousands of records per second.

With the Go race detector enabled (`go test -race`), the test suite reliably reports a data race on the `results` slice. In production (race detector disabled) the output is occasionally corrupted — some entries are zero-valued or overwritten with another record's data.

The team noticed the race only when two goroutines happen to compute the same loop index, which they believed was impossible given the index is assigned per-iteration. They ruled out the transformation function itself as a source of shared state.

## Buggy code

```go
package transform

import "sync"

type Item struct {
	ID    int
	Value float64
}

func ParallelMap(items []Item, fn func(Item) Item) []Item {
	results := make([]Item, len(items))
	var wg sync.WaitGroup
	for i := range items {
		wg.Add(1)
		go func() {
			defer wg.Done()
			results[i] = fn(items[i])
		}()
	}
	wg.Wait()
	return results
}
```
