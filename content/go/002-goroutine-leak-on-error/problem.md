---
slug: goroutine-leak-on-error
track: go
orderIndex: 2
title: Goroutine Leak on Channel Send
difficulty: easy
tags:
  - goroutines
  - channels
  - resource-management
language: go
---

## Context

This code lives in `internal/search/handler.go`, a fan-out search aggregator that queries multiple backend services concurrently and collects their results. Each backend is queried in its own goroutine, and results are collected into a buffered channel.

Operators noticed that under load the service's goroutine count climbs steadily and never falls back. A heap dump shows thousands of goroutines blocked on a channel send, each holding a reference to a large `Result` struct. The leak is visible in the `/debug/pprof/goroutine` endpoint within minutes of the service starting under production traffic.

The team initially suspected the backend clients were hanging and added aggressive timeouts to the HTTP calls. The goroutine count still climbs. The cancellation logic looks fine at first glance — the context is correctly cancelled on function return.

## Buggy code

```go
package search

import (
	"context"
	"log"
)

type Result struct {
	Backend string
	Data    []byte
}

func FanOut(ctx context.Context, query string, backends []Backend) []Result {
	results := make(chan Result)
	for _, b := range backends {
		b := b
		go func() {
			res, err := b.Search(ctx, query)
			if err != nil {
				log.Printf("backend %s error: %v", b.Name(), err)
				return
			}
			results <- res
		}()
	}

	var out []Result
	for i := 0; i < len(backends); i++ {
		out = append(out, <-results)
	}
	return out
}

type Backend interface {
	Name() string
	Search(ctx context.Context, query string) (Result, error)
}
```
