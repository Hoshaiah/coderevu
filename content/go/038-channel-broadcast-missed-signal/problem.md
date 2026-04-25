---
slug: channel-broadcast-missed-signal
track: go
orderIndex: 38
title: Broadcast on Unbuffered Notification Channel
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
  - correctness
language: go
---

## Context

This code is in `internal/cache/invalidator.go`. A background goroutine listens for cache invalidation events on a Redis pub/sub channel and notifies multiple local subscribers (HTTP handler goroutines) that their cached data is stale. Each subscriber calls `WaitForInvalidation` and blocks until notified.

Under load, some HTTP handlers return stale data even after a cache invalidation event has been published. The more handlers are waiting concurrently, the more miss the signal. The issue only appears in production with real concurrency; tests with a single waiter always pass.

The team has confirmed events are arriving from Redis correctly and that the `publish` function is being called. They ruled out network issues. The problem is in how the notification is broadcast to local goroutines.

## Buggy code

```go
package cache

import "sync"

type Invalidator struct {
	mu   sync.Mutex
	subs []chan struct{}
}

func (inv *Invalidator) WaitForInvalidation() {
	ch := make(chan struct{})
	inv.mu.Lock()
	inv.subs = append(inv.subs, ch)
	inv.mu.Unlock()
	<-ch
}

// publish is called by the Redis listener goroutine.
func (inv *Invalidator) publish() {
	inv.mu.Lock()
	subs := inv.subs
	inv.subs = nil
	inv.mu.Unlock()

	for _, ch := range subs {
		ch <- struct{}{}
	}
}
```
