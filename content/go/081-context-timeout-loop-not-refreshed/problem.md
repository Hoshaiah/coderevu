---
slug: context-timeout-loop-not-refreshed
track: go
orderIndex: 81
title: Context Timeout Reused Across Retries
difficulty: medium
tags:
  - context
  - errors
  - correctness
language: go
---

## Context

This code is in `internal/downstream/client.go`. It calls an upstream RPC that can transiently fail, and retries up to three times. Each iteration is supposed to have its own per-attempt deadline so that a slow first attempt doesn't eat the timeout budget of subsequent ones.

In production the service sometimes logs `context deadline exceeded` on the first retry even when the downstream recovered quickly, but it also sometimes succeeds on the third attempt with a full timeout budget as if the context was fresh. The behavior is inconsistent and hard to reproduce in unit tests.

The team checked that the passed-in `ctx` has no pre-existing deadline. They suspect something is wrong with how the per-attempt context is created inside the loop.

## Buggy code

```go
package downstream

import (
	"context"
	"fmt"
	"time"
)

func callWithRetry(ctx context.Context, req Request) (Response, error) {
	var lastErr error
	attempCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()

	for attempt := 0; attempt < 3; attempt++ {
		resp, err := doCall(attempCtx, req)
		if err == nil {
			return resp, nil
		}
		lastErr = err
	}
	return Response{}, fmt.Errorf("all attempts failed: %w", lastErr)
}

type Request struct{ ID string }
type Response struct{ Body string }

func doCall(ctx context.Context, req Request) (Response, error) { return Response{}, nil }
```
