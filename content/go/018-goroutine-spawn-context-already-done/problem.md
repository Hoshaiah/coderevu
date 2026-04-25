---
slug: goroutine-spawn-context-already-done
track: go
orderIndex: 18
title: Goroutine Spawned After Context Cancelled
difficulty: medium
tags:
  - goroutines
  - context
  - correctness
language: go
---

## Context

This function is in `internal/notify/dispatcher.go`. It dispatches webhook notifications to a list of endpoints concurrently. Each notification is sent in its own goroutine, and the function uses a context to enforce an overall deadline. Results (errors) are collected via a channel.

Operators see that even after the overall context deadline is exceeded, HTTP requests keep arriving at the webhook endpoints for several seconds. The desired behaviour is that no new HTTP requests are started once the deadline passes.

The team confirmed that the context is correctly cancelled when the deadline expires and that `sendWebhook` does respect context cancellation once started. The issue is that requests are being started even when they should not be.

## Buggy code

```go
package notify

import (
	"context"
	"fmt"
	"net/http"
)

type Endpoint struct {
	URL string
}

func Dispatch(ctx context.Context, endpoints []Endpoint, payload []byte) []error {
	errCh := make(chan error, len(endpoints))

	for _, ep := range endpoints {
		ep := ep
		go func() {
			errCh <- sendWebhook(ctx, ep.URL, payload)
		}()
	}

	errs := make([]error, 0, len(endpoints))
	for range endpoints {
		if err := <-errCh; err != nil {
			errs = append(errs, err)
		}
	}
	return errs
}

func sendWebhook(ctx context.Context, url string, payload []byte) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send to %s: %w", url, err)
	}
	resp.Body.Close()
	return nil
}
```
