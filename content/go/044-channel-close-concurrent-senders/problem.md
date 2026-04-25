---
slug: channel-close-concurrent-senders
track: go
orderIndex: 44
title: Concurrent Senders Race on Close
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
  - panic
language: go
---

## Context

This code is in `internal/pipeline/fanin.go`. It implements a fan-in that merges results from N parallel workers into a single output channel. A supervisor goroutine waits for all workers to finish and then closes the output channel to signal downstream consumers that the stream is complete.

In a load test with more than 8 workers, the pipeline panics intermittently with `send on closed channel`. The panic occurs inside one of the worker goroutines. It is not reproducible with a single worker.

The team added a `sync.Mutex` around the `close(out)` call, but the panic persisted. They also tried a `sync.Once` around `close`, and that helped with the close itself but the panic still occurred occasionally — indicating a worker is trying to send after the channel is closed.

## Buggy code

```go
package pipeline

import (
	"sync"
)

type Item struct{ Value int }

func FanIn(workers []func() Item) <-chan Item {
	out := make(chan Item)
	var wg sync.WaitGroup

	for _, w := range workers {
		wg.Add(1)
		w := w
		go func() {
			defer wg.Done()
			out <- w()
		}()
	}

	// BUG: close is called without waiting for all senders to finish.
	close(out)

	go func() {
		wg.Wait()
	}()

	return out
}
```
