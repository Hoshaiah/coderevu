---
slug: channel-unbuffered-ctx-race
track: go
orderIndex: 37
title: Send Races With Context Cancel
difficulty: medium
tags:
  - channels
  - context
  - goroutines
  - concurrency
language: go
---

## Context

This function lives in `pkg/search/query.go` and fans out a single search query to multiple backend shards in parallel, returning the first successful result. It is used on every user-facing search request and is latency-sensitive.

Under moderate load, the service occasionally hangs for exactly 30 seconds (the outer request timeout) even when all shards respond quickly. Profiling shows goroutines stuck on a channel send inside the `go func` closures. The symptom is intermittent and harder to reproduce with fewer concurrent requests.

The team has verified that shard response times are well within limits and that context cancellation is propagated correctly to the HTTP clients inside `queryBackend`. They believe the issue is in how results are collected rather than in the backend calls themselves.

## Buggy code

```go
package search

import (
	"context"
	"errors"
)

type ShardResult struct {
	Shard int
	Data  string
}

func queryBackend(ctx context.Context, shard int) (ShardResult, error) {
	// real implementation calls an HTTP endpoint
	return ShardResult{}, errors.New("not implemented")
}

func FirstResult(ctx context.Context, shards []int) (ShardResult, error) {
	resultCh := make(chan ShardResult)
	errCh := make(chan error, len(shards))

	for _, s := range shards {
		go func(shard int) {
			res, err := queryBackend(ctx, shard)
			if err != nil {
				errCh <- err
				return
			}
			resultCh <- res
		}(s)
	}

	for range shards {
		select {
		case res := <-resultCh:
			return res, nil
		case <-errCh:
			// one shard failed, try the next
		case <-ctx.Done():
			return ShardResult{}, ctx.Err()
		}
	}
	return ShardResult{}, errors.New("all shards failed")
}
```
