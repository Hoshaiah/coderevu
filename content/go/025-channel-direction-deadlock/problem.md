---
slug: channel-direction-deadlock
track: go
orderIndex: 25
title: Pipeline Stage Deadlocks
difficulty: easy
tags:
  - channels
  - concurrency
  - deadlock
language: go
---

## Context

This snippet is from `pkg/pipeline/stage.go` in an ETL service that reads records from an upstream channel, transforms them, and forwards them to a downstream channel. The function is intentionally kept simple so junior engineers can slot it into larger pipelines.

During integration testing the whole pipeline hangs indefinitely. The `go test` run times out after 30 seconds. A `SIGQUIT` dump shows both the producer and the `Transform` goroutine are stuck in channel operations, but the exact reason isn't obvious from the stack trace alone.

The reviewer already confirmed that the upstream producer is correctly sending data and never closes the channel prematurely. The bug is entirely inside `Transform`.

## Buggy code

```go
package pipeline

func Transform(in, out chan string, fn func(string) string) {
	go func() {
		for v := range in {
			out <- fn(v)
		}
		close(in) // signal we are done
	}()
}
```
