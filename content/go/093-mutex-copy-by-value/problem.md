---
slug: mutex-copy-by-value
track: go
orderIndex: 93
title: Mutex copied by value silently stops protecting shared state
difficulty: medium
tags:
  - concurrency
  - mutex
  - sync
  - struct-copy
language: go
---

## Context

This is a cache layer sitting in front of a slow downstream API. Multiple goroutines call `Get` concurrently to look up user profiles. In production the team occasionally sees inconsistent reads and even panics from concurrent map access, even though they're certain the mutex is being used correctly.

## Buggy code

```go
package cache

import (
	"sync"
)

type Cache struct {
	mu    sync.Mutex
	store map[string]string
}

func NewCache() Cache {
	return Cache{store: make(map[string]string)}
}

func (c Cache) Set(key, value string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.store[key] = value
}

func (c Cache) Get(key string) (string, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	v, ok := c.store[key]
	return v, ok
}
```
