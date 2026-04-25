---
slug: context-goroutine-wrong-parent
track: go
orderIndex: 78
title: Background Context Loses Cancellation
difficulty: medium
tags:
  - context
  - goroutines
  - correctness
language: go
---

## Context

This code is in `internal/thumbnail/processor.go`. An image-processing service creates a derived context with a timeout for each thumbnail generation job, then spawns a goroutine to do the actual encoding. The intent is that if a request is cancelled or the timeout fires, the encoding work also stops promptly.

Load-test engineers noticed that even after the HTTP request context is cancelled (client disconnect), thumbnail-encoding goroutines keep running to completion — sometimes for several seconds — and the response is never sent. The service's goroutine count grows unboundedly under high cancellation rates.

Network traces confirm the client disconnects cleanly, and the HTTP server's request context is indeed cancelled. The team added a log line right after `ctx.Done()` fires in the handler and confirmed cancellation propagates to the handler level. The goroutine must not be observing it.

## Buggy code

```go
package thumbnail

import (
	"context"
	"fmt"
	"time"
)

type Image struct{ Data []byte }

func encode(ctx context.Context, img Image) ([]byte, error) {
	// simulates CPU-bound encoding that checks ctx periodically
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(200 * time.Millisecond):
		return img.Data, nil
	}
}

func GenerateThumbnail(ctx context.Context, img Image) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	type result struct {
		data []byte
		err  error
	}

	ch := make(chan result, 1)
	go func() {
		data, err := encode(ctx, img)
		ch <- result{data, err}
	}()

	select {
	case r := <-ch:
		return r.data, r.err
	case <-ctx.Done():
		return nil, fmt.Errorf("thumbnail: %w", ctx.Err())
	}
}
```
