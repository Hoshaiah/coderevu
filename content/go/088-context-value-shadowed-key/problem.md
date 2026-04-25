---
slug: context-value-shadowed-key
track: go
orderIndex: 88
title: Context Value Shadowed by String Key
difficulty: hard
tags:
  - context
  - errors
  - api-misuse
language: go
---

## Context

This code spans two files: `internal/auth/middleware.go` sets a user ID in the request context, and `internal/billing/handler.go` reads it back. Both packages import each other's types through a shared `internal/ctxkeys` package. The middleware is applied globally and the billing handler expects to read the authenticated user ID from context.

In production, the billing handler always receives `0` for the user ID despite the middleware logging the correct non-zero value. Every request goes through the middleware (confirmed by access logs), but the billing handler cannot find the value. Surprisingly, a direct test of the middleware in isolation passes.

The team added `fmt.Println(ctx.Value("user_id"))` everywhere and saw the value appear — but then realized they were looking at the wrong key. The problem is a subtle mismatch in key types used to store and retrieve the value.

## Buggy code

```go
// file: internal/auth/middleware.go
package auth

import (
	"context"
	"net/http"
	"strconv"
)

type contextKey string

const UserIDKey contextKey = "user_id"

func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, _ := strconv.Atoi(r.Header.Get("X-User-ID"))
		ctx := context.WithValue(r.Context(), UserIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```
