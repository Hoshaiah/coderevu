---
slug: channel-pipeline-blocking-on-error
track: go
orderIndex: 42
title: Error Path Blocks Pipeline Stage
difficulty: hard
tags:
  - channels
  - goroutines
  - errors
  - deadlock
language: go
---

## Context

This file is `internal/stream/transform.go`. It implements a two-stage pipeline: a producer pushes integers onto `in`, a `transform` goroutine reads from `in`, squares each value, and sends results to `out`. The caller collects results from `out` and checks for an error returned by `Transform`.

The pipeline deadlocks intermittently in tests. When a simulated processing error is injected by returning early from `Transform` before draining `in`, the producer goroutine hangs forever. The test runner reports a timeout after 30 seconds. The deadlock only occurs when the producer is still sending values at the moment `Transform` encounters the error and returns.

The team traced the hang to the producer being blocked on `in <- v` with nobody left to receive. The channel buffer was increased to 100 but the deadlock still happens with more than 100 items.

## Buggy code

```go
package stream

import "fmt"

func produce(in chan<- int, count int) {
	for i := 0; i < count; i++ {
		in <- i
	}
	close(in)
}

func Transform(count int) ([]int, error) {
	in := make(chan int, 8)
	out := make(chan int, 8)

	go produce(in, count)

	go func() {
		for v := range in {
			if v == 5 {
				close(out)
				return
			}
			out <- v * v
		}
		close(out)
	}()

	var results []int
	for v := range out {
		results = append(results, v)
	}

	if len(results) < count {
		return results, fmt.Errorf("transform incomplete: got %d, want %d", len(results), count)
	}
	return results, nil
}
```
