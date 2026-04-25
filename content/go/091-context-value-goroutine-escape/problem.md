---
slug: context-value-goroutine-escape
track: go
orderIndex: 91
title: Context Value Escapes Its Goroutine
difficulty: hard
tags:
  - context
  - goroutines
  - concurrency
  - data-race
language: go
---

## Context

This middleware is in `internal/middleware/request_id.go`. It injects a per-request trace ID into the context and also stores a pointer to a metrics accumulator so handlers can record latency breakdowns. The accumulator is mutated during the request and read at the end to emit metrics.

Under high concurrency the race detector flags a data race on the `Accumulator` struct's fields. The report points to writes inside HTTP handlers and concurrent reads happening elsewhere. Strangely, all handlers receive their own context, so the team assumed there could be no sharing.

Reviewing the code more carefully, an engineer noticed that the `Accumulator` pointer stored in the context is not freshly allocated per request — it comes from somewhere unexpected.

## Buggy code

```go
package middleware

import (
	"context"
	"net/http"
)

type contextKey string

const accKey contextKey = "accumulator"

type Accumulator struct {
	DBMs   float64
	CacheMs float64
}

func (a *Accumulator) AddDB(ms float64)    { a.DBMs += ms }
func (a *Accumulator) AddCache(ms float64) { a.CacheMs += ms }

var sharedAcc Accumulator

func RequestMetrics(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sharedAcc = Accumulator{} // reset for this request
		ctx := context.WithValue(r.Context(), accKey, &sharedAcc)
		next.ServeHTTP(w, r.WithContext(ctx))
		acc := ctx.Value(accKey).(*Accumulator)
		emitMetrics(acc)
	})
}

func emitMetrics(a *Accumulator) { /* send to metrics backend */ }
func GetAccumulator(ctx context.Context) *Accumulator {
	return ctx.Value(accKey).(*Accumulator)
}
```
