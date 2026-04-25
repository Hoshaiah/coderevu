---
slug: goroutine-spawn-unbounded-semaphore
track: go
orderIndex: 17
title: Unbounded Goroutine Fan-Out
difficulty: medium
tags:
  - goroutines
  - concurrency
  - channels
language: go
---

## Context

This code is in `internal/crawler/runner.go`. The crawler is given a list of URLs to fetch and index, potentially thousands at a time. It is invoked by a cron job every hour. The system runs on a VM with 2 CPU cores and 512 MB of RAM.

Every hour at the top of the cron run the VM becomes unresponsive: CPU spikes to 100%, memory exhausts, and the OOM killer terminates the process. After the VM recovers, operators see the crawl job never actually completed any useful work during the spike.

The team confirmed that each call to `fetchAndIndex` makes at least one outbound HTTP request. They expected Go's goroutine scheduler to handle the concurrency gracefully, but did not account for the system-level cost of thousands of simultaneous HTTP connections.

## Buggy code

```go
package crawler

import (
	"fmt"
	"net/http"
	"sync"
)

func RunCrawl(urls []string) []error {
	var (
		mu   sync.Mutex
		wg   sync.WaitGroup
		errs []error
	)

	for _, u := range urls {
		wg.Add(1)
		go func(url string) {
			defer wg.Done()
			if err := fetchAndIndex(url); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}(u)
	}

	wg.Wait()
	return errs
}

func fetchAndIndex(url string) error {
	resp, err := http.Get(url)
	if err != nil {
		return fmt.Errorf("fetch %s: %w", url, err)
	}
	defer resp.Body.Close()
	return nil
}
```
