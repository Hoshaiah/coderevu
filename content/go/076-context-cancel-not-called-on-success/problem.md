---
slug: context-cancel-not-called-on-success
track: go
orderIndex: 76
title: Cancel Function Never Called
difficulty: easy
tags:
  - context
  - resource-management
  - goroutines
language: go
---

## Context

This handler lives in `internal/api/handler.go`. It creates a child context with a timeout for each incoming request to bound the downstream database query. The handler is deployed behind a high-traffic API gateway that issues thousands of requests per second.

After running in production for a day, the service's memory and goroutine counts grow without bound. `pprof` shows goroutines accumulating inside the Go runtime's timer heap. The memory growth tracks closely with request throughput. Restarting the service resets the count, but it climbs again immediately.

The team has confirmed the database queries themselves complete in well under the timeout. They noted the pprof goroutine dump mentions `context.WithTimeout` timer goroutines but were not sure why they persist.

## Buggy code

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

type UserStore interface {
	GetUser(ctx context.Context, id string) (map[string]any, error)
}

type Handler struct {
	store UserStore
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	ctx, _ := context.WithTimeout(r.Context(), 5*time.Second)

	user, err := h.store.GetUser(ctx, r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}
```
