---
slug: context-value-race-mutable-map
track: go
orderIndex: 82
title: Mutable Map Value in Context
difficulty: medium
tags:
  - context
  - goroutines
  - concurrency
language: go
---

## Context

This middleware lives in `api/middleware/trace.go` in an HTTP service that handles roughly 2,000 requests per second. Each incoming request gets a context decorated with request metadata stored as a `map[string]string`. Downstream handlers read and occasionally write to this map to accumulate trace annotations.

Under load the service crashes intermittently with `concurrent map read and map write` from the Go runtime. The stack trace points into various downstream handlers that look up or set keys in the metadata map. The crashes are not reproducible with a single-threaded test.

The team ruled out the middleware itself as the write site — it only stores the map once with `context.WithValue`. The concurrent writes are coming from handlers that all share the same context and therefore the same underlying map pointer.

## Buggy code

```go
package middleware

import (
	"context"
	"net/http"
)

type contextKey string

const metaKey contextKey = "request-meta"

func InjectMeta(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		meta := map[string]string{
			"request_id": r.Header.Get("X-Request-ID"),
			"region":     r.Header.Get("X-Region"),
		}
		ctx := context.WithValue(r.Context(), metaKey, meta)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetMeta(ctx context.Context) map[string]string {
	v := ctx.Value(metaKey)
	if v == nil {
		return nil
	}
	return v.(map[string]string)
}
```
