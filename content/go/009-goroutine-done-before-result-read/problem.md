---
slug: goroutine-done-before-result-read
track: go
orderIndex: 9
title: WaitGroup Done Before Result Written
difficulty: easy
tags:
  - goroutines
  - concurrency
  - channels
language: go
---

## Context

This lives in `internal/pipeline/fanout.go`, a fan-out helper used by an ETL service that fetches product prices from multiple pricing APIs in parallel and returns the first successful result. The function is called once per incoming HTTP request.

Operators notice that roughly 5–10% of responses return an empty price even though at least one upstream API always succeeds. Restarting the service doesn't help; the failure rate is stable under load.

The team added logging and confirmed that the goroutines do complete and write their results — but the caller sometimes reads a zero-value before any goroutine has finished writing. A race detector run flagged a data race on the `result` variable.

## Buggy code

```go
package pipeline

import "sync"

type PriceResult struct {
	Source string
	Price  float64
}

func FetchFirst(sources []string, fetch func(string) (PriceResult, error)) PriceResult {
	var (
		mu     sync.Mutex
		wg     sync.WaitGroup
		result PriceResult
	)

	for _, src := range sources {
		wg.Add(1)
		go func(s string) {
			r, err := fetch(s)
			if err == nil && r.Price > result.Price {
				mu.Lock()
				result = r
				mu.Unlock()
			}
			wg.Done()
		}(src)
	}

	wg.Wait()
	return result
}
```
