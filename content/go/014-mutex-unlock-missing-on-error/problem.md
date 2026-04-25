---
slug: mutex-unlock-missing-on-error
track: go
orderIndex: 14
title: Mutex Never Unlocked on Error
difficulty: medium
tags:
  - goroutines
  - concurrency
  - resource-management
  - errors
language: go
---

## Context

The code is in `internal/cache/lru.go`, implementing a thread-safe LRU cache used by an API that serves product catalogue data. Multiple request goroutines call `Set` concurrently to update cache entries after fetching from the database.

Under certain conditions (specifically when `serialize` returns an error), the service stops responding entirely. All incoming requests hang, goroutines pile up, and the only recovery is a process restart. There are no panics in the logs.

A profiling session confirmed goroutines are blocked waiting to acquire the cache mutex. The mutex is never released in the error path, so the very first serialization failure permanently deadlocks all future cache operations.

## Buggy code

```go
package cache

import (
	"encoding/json"
	"errors"
	"sync"
)

type LRUCache struct {
	mu    sync.Mutex
	store map[string][]byte
}

func NewLRUCache() *LRUCache {
	return &LRUCache{store: make(map[string][]byte)}
}

func (c *LRUCache) Set(key string, value any) error {
	data, err := serialize(value)
	if err != nil {
		return errors.New("serialize failed: " + err.Error())
	}

	c.mu.Lock()
	if len(c.store) > 10000 {
		c.mu.Unlock()
		return errors.New("cache full")
	}
	c.store[key] = data
	c.mu.Unlock()
	return nil
}

func serialize(v any) ([]byte, error) {
	return json.Marshal(v)
}

func (c *LRUCache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.store[key]
	return v, ok
}
```
