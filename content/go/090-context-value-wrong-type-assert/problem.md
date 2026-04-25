---
slug: context-value-wrong-type-assert
track: go
orderIndex: 90
title: Context Value Panics on Type Assert
difficulty: hard
tags:
  - context
  - errors
  - correctness
language: go
---

## Context

This middleware chain is in `internal/auth/middleware.go`. The first middleware stores a `UserID` string in the request context. A downstream handler retrieves it and uses it to scope a database query.

In production an obscure but reproducible panic occurs: `interface conversion: interface {} is nil, not string`. It happens only on unauthenticated requests that somehow bypass the auth middleware — for example, OPTIONS preflight requests that are short-circuited by a CORS middleware earlier in the chain.

The team reviewed the auth middleware and it looks correct. They have not yet looked at how the handler retrieves the value from the context.

## Buggy code

```go
package auth

import (
	"context"
	"net/http"
)

type contextKey string

const userIDKey contextKey = "userID"

func SetUserID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

func UserIDFromContext(ctx context.Context) string {
	return ctx.Value(userIDKey).(string)
}

func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := r.Header.Get("Authorization")
		if token == "" {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := SetUserID(r.Context(), token)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```
