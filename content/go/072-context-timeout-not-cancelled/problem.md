---
slug: context-timeout-not-cancelled
track: go
orderIndex: 72
title: Context Timeout Cancel Leak
difficulty: easy
tags:
  - context
  - resource-management
  - goroutines
language: go
---

## Context

This is `internal/gateway/forward.go`, a request-forwarding layer in an API gateway. Each incoming request is forwarded to an upstream service with a hard timeout. The context passed to the upstream call is derived from the incoming request context so that client disconnects also abort the upstream call.

After running for several hours under load, the process's memory usage grows unboundedly. A profile shows thousands of timer goroutines accumulating, each corresponding to an unfreed context deadline. Restarting the process clears the leak, and it grows back at a rate proportional to requests per second.

The service handles thousands of requests per second and each invocation of `Forward` creates a new derived context. The team confirmed the upstream HTTP calls themselves complete promptly.

## Buggy code

```go
package gateway

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

const upstreamTimeout = 5 * time.Second

func Forward(ctx context.Context, req *http.Request) (*http.Response, error) {
	ctx, _ = context.WithTimeout(ctx, upstreamTimeout)

	upstreamReq, err := http.NewRequestWithContext(ctx, req.Method, req.URL.String(), req.Body)
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}

	resp, err := http.DefaultClient.Do(upstreamReq)
	if err != nil {
		return nil, fmt.Errorf("upstream do: %w", err)
	}
	return resp, nil
}
```
