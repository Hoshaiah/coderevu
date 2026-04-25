---
slug: goroutine-panic-nil-channel-close
track: go
orderIndex: 29
title: Close on Nil Channel Panics
difficulty: easy
tags:
  - channels
  - goroutines
  - correctness
language: go
---

## Context

This pipeline helper is in `internal/pipeline/fanout.go`. It takes an input channel and fans its values out to N worker goroutines. A `done` channel is provided so workers can signal completion; the orchestrator closes `done` to broadcast shutdown.

In a specific code path where the caller passes `n = 0` (no workers wanted), the process crashes with a panic: `close of nil channel`. The crash only happens in rare configuration-driven scenarios where the worker count is read from a config file that can legitimately contain zero.

The team has seen the stack trace pointing to the `close(done)` line but cannot understand why `done` would be nil there.

## Buggy code

```go
package pipeline

import "sync"

func Fanout(input <-chan int, n int, process func(int)) {
	var done chan struct{}
	var wg sync.WaitGroup

	if n > 0 {
		done = make(chan struct{})
		wg.Add(n)
		for i := 0; i < n; i++ {
			go func() {
				defer wg.Done()
				for {
					select {
					case v, ok := <-input:
						if !ok {
							return
						}
						process(v)
					case <-done:
						return
					}
				}
			}()
		}
	}

	wg.Wait()
	close(done)
}
```
