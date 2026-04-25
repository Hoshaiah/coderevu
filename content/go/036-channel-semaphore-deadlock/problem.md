---
slug: channel-semaphore-deadlock
track: go
orderIndex: 36
title: Semaphore Channel Causes Deadlock
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
  - deadlock
language: go
---

## Context

This file is `internal/crawler/fetcher.go`, part of a web-crawling service that limits the number of concurrent outbound HTTP requests. A buffered channel acts as a semaphore: a goroutine acquires a slot by sending to the channel and releases it by receiving. The function is called from a pool of goroutines managed by the crawl scheduler.

Under load, the crawler occasionally deadlocks — the process stops making progress and CPU drops to zero. The deadlock is not consistent; it only appears when the number of URLs submitted exceeds the semaphore capacity and several goroutines encounter errors simultaneously.

The team added logging and confirmed that some goroutines call `fetch` with a pre-cancelled context (e.g. because the parent crawl was aborted). Those goroutines appear to be the ones that trigger the stall.

## Buggy code

```go
package crawler

import (
	"context"
	"fmt"
	"io"
	"net/http"
)

const maxConcurrent = 4

var sem = make(chan struct{}, maxConcurrent)

func fetch(ctx context.Context, url string) ([]byte, error) {
	// Acquire semaphore slot.
	sem <- struct{}{}
	defer func() { <-sem }()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	return body, nil
}
```
