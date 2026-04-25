---
slug: race-on-map-write
track: go
orderIndex: 94
title: Concurrent map writes cause random panics in the HTTP handler
difficulty: medium
tags:
  - concurrency
  - race-condition
  - maps
  - http
language: go
---

## Context

This in-process rate limiter is used by an HTTP server that handles thousands of requests per second. The server panics intermittently with "concurrent map read and map write", but only under high concurrency. The team added `sync.Mutex` to protect incrementing the counter but the panics persist.

## Buggy code

```go
package ratelimit

import (
	"net/http"
	"sync"
	"time"
)

type Limiter struct {
	mu      sync.Mutex
	counts  map[string]int
	resetAt time.Time
}

func NewLimiter() *Limiter {
	return &Limiter{
		counts:  make(map[string]int),
		resetAt: time.Now().Add(time.Minute),
	}
}

func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	if time.Now().After(l.resetAt) {
		l.counts = make(map[string]int)
		l.resetAt = time.Now().Add(time.Minute)
	}
	l.counts[key]++
	l.mu.Unlock()
	return l.counts[key] <= 100
}
```
