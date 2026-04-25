---
slug: channel-result-lost-on-ctx-cancel
track: go
orderIndex: 45
title: Result Lost When Context Cancelled
difficulty: hard
tags:
  - channels
  - context
  - goroutines
  - correctness
language: go
---

## Context

This helper is in `internal/cache/loader.go`. It runs a cache-fill operation in a background goroutine with a timeout. The goroutine sends its result (or error) on an unbuffered channel. The caller selects between the result channel and the context deadline.

Under load, cache misses are occasionally logged as errors even when the underlying load function succeeds. Detailed tracing shows that `loadFn` returns successfully within the timeout window, yet the caller treats the result as a timeout. The loaded value is then never stored in the cache, causing repeated expensive reloads.

The team verified that the timeout is set generously (5× the average load time) and that `loadFn` itself never exceeds the budget. The issue appears to be a race between the result arriving and the context being processed.

## Buggy code

```go
package cache

import (
	"context"
	"fmt"
	"time"
)

type Value struct{ Data string }

func LoadWithTimeout(key string, loadFn func(string) (Value, error)) (Value, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	type result struct {
		v   Value
		err error
	}

	ch := make(chan result)
	go func() {
		v, err := loadFn(key)
		ch <- result{v, err}
	}()

	select {
	case <-ctx.Done():
		return Value{}, fmt.Errorf("load timeout for key %q: %w", key, ctx.Err())
	case res := <-ch:
		return res.v, res.err
	}
}
```
