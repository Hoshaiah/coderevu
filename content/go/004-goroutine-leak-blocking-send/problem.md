---
slug: goroutine-leak-blocking-send
track: go
orderIndex: 4
title: Goroutine Leak on Blocking Send
difficulty: easy
tags:
  - goroutines
  - channels
  - concurrency
language: go
---

## Context

This helper lives in `internal/notify/fanout.go` and is called by an HTTP handler that wants to fan out a notification to a dynamic set of subscribers. Each subscriber gets its own goroutine so slow consumers don't block the others. The buffered results are collected into a slice and returned to the handler.

Operators noticed that under moderate load (a few hundred requests per minute) the process RSS grows without bound and eventually the service is OOM-killed. A `runtime.NumGoroutine()` metric added to a `/debug/metrics` endpoint climbs monotonically — it never decreases. Restarting the service temporarily recovers it.

The team already checked for missing `wg.Done()` calls and confirmed all goroutines do eventually call it. The leak is subtler — it is not about `WaitGroup` at all.

## Buggy code

```go
package notify

import "sync"

type Result struct {
	SubscriberID string
	Err          error
}

func Fanout(subscribers []string, send func(string) error) []Result {
	resultCh := make(chan Result)
	var wg sync.WaitGroup

	for _, id := range subscribers {
		wg.Add(1)
		go func(sub string) {
			defer wg.Done()
			err := send(sub)
			resultCh <- Result{SubscriberID: sub, Err: err}
		}(id)
	}

	go func() {
		wg.Wait()
		close(resultCh)
	}()

	var results []Result
	for r := range resultCh {
		results = append(results, r)
	}
	return results
}
```
