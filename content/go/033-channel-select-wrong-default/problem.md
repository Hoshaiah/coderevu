---
slug: channel-select-wrong-default
track: go
orderIndex: 33
title: Missed Signal Due to Wrong Select
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This code is in `internal/worker/poller.go`. A background goroutine polls a work queue and is supposed to stop cleanly when a shutdown signal is sent on a `done` channel. The function is launched with `go Run(done)` at server startup. The integration test sends on `done` and then checks that the goroutine has exited within 500ms using `goleak`.

The integration test reliably times out — the goroutine never exits even after `done` is closed. Interestingly, if the work queue always has items the goroutine exits promptly; the problem only manifests when the queue is empty (the common case in a lightly-loaded system).

The developer correctly noticed that a `select` was needed to handle both the queue and the shutdown signal, but made a subtle structural mistake in how the cases are ordered.

## Buggy code

```go
package worker

import "time"

func Run(done <-chan struct{}, dequeue func() (string, bool)) {
	for {
		select {
		case <-done:
			return
		default:
		}

		item, ok := dequeue()
		if !ok {
			time.Sleep(100 * time.Millisecond)
			continue
		}

		process(item)
	}
}

func process(item string) { /* ... */ }
```
