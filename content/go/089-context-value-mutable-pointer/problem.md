---
slug: context-value-mutable-pointer
track: go
orderIndex: 89
title: Mutable Pointer Stored in Context
difficulty: hard
tags:
  - context
  - goroutines
  - concurrency
language: go
---

## Context

This middleware is in `middleware/request_meta.go`. It attaches per-request metadata (user ID, trace ID, feature flags) to the context and provides a helper for handlers to mutate the flags during the request lifecycle. The metadata struct is stored by pointer so handlers can add flags without creating a new context.

The service processes each request with a single goroutine so developers assumed no concurrency inside a single request. However, some handlers spawn background goroutines (fire-and-forget audit logging) that also read the flags. Intermittently, the audit goroutines log incorrect flag values.

The team added `-race` and found a data race between a handler writing a flag and the audit goroutine reading it. They incorrectly concluded the fix was to add a `sync.Mutex` inside `RequestMeta`, but the race persisted because they only guarded writes, not reads.

## Buggy code

```go
package middleware

import (
	"context"
	"net/http"
	"sync"
)

type contextKey struct{}

type RequestMeta struct {
	UserID  string
	TraceID string
	Flags   map[string]bool
	mu      sync.Mutex
}

func (m *RequestMeta) SetFlag(key string, val bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Flags[key] = val
}

func (m *RequestMeta) GetFlag(key string) bool {
	// BUG: no lock held on read
	return m.Flags[key]
}

func Inject(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		meta := &RequestMeta{
			Flags: make(map[string]bool),
		}
		ctx := context.WithValue(r.Context(), contextKey{}, meta)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func MetaFromContext(ctx context.Context) *RequestMeta {
	m, _ := ctx.Value(contextKey{}).(*RequestMeta)
	return m
}
```
