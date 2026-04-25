---
slug: goroutine-leak-response-not-consumed
track: go
orderIndex: 11
title: Goroutine Blocked on HTTP Response
difficulty: easy
tags:
  - goroutines
  - channels
  - http
  - resource-management
language: go
---

## Context

This code lives in `internal/fetcher/parallel.go` and is part of a data pipeline that fetches JSON payloads from a list of external URLs concurrently, then collects the results into a slice. It is called once per pipeline run, which happens every 30 seconds.

After several hours of operation, the service's goroutine count climbs steadily and memory usage grows. Operators notice the process never stabilises — goroutines accumulate until the pod is OOM-killed by Kubernetes. The symptom appears proportional to how many URLs return large bodies.

A colleague added a `runtime.NumGoroutine()` log line and confirmed goroutines are leaking specifically inside `fetchAll`. The HTTP client, timeout settings, and DNS resolution have all been checked and are functioning normally.

## Buggy code

```go
package fetcher

import (
	"encoding/json"
	"net/http"
	"sync"
)

type Result struct {
	URL  string
	Data map[string]any
}

func fetchAll(urls []string) []Result {
	results := make(chan Result, len(urls))
	var wg sync.WaitGroup

	for _, u := range urls {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			resp, err := http.Get(url)
			if err != nil {
				return
			}
			var data map[string]any
			if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
				return
			}
			results <- Result{URL: url, Data: data}
		}(u)
	}

	wg.Wait()
	close(results)

	var out []Result
	for r := range results {
		out = append(out, r)
	}
	return out
}
```
