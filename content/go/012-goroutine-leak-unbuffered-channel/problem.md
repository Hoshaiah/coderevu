---
slug: goroutine-leak-unbuffered-channel
track: go
orderIndex: 12
title: Goroutine Leak on Timeout
difficulty: medium
tags:
  - goroutines
  - channels
  - concurrency
  - resource-management
language: go
---

## Context

This code lives in `internal/fetcher/remote.go`, part of a microservice that fans out HTTP requests to several upstream APIs and returns the first successful result. The function is called on every incoming request, so it runs thousands of times per minute under normal load.

Operators noticed the process's goroutine count (visible via `/debug/pprof/goroutine`) climbs steadily over hours and never returns to baseline. Memory usage also creeps upward. No errors are surfaced to callers — everything looks correct from the outside.

The team added `runtime.NumGoroutine()` logging and confirmed each call to `FetchFirst` leaks goroutines whenever the context deadline fires before all workers finish. The HTTP client calls themselves are not the issue — they respect the context correctly.

## Buggy code

```go
package fetcher

import (
	"context"
	"fmt"
	"net/http"
)

func FetchFirst(ctx context.Context, urls []string) (string, error) {
	results := make(chan string)

	for _, u := range urls {
		url := u
		go func() {
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
			if err != nil {
				return
			}
			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				return
			}
			defer resp.Body.Close()
			results <- fmt.Sprintf("%s:%d", url, resp.StatusCode)
		}()
	}

	select {
	case res := <-results:
		return res, nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}
```
