---
slug: context-value-wrong-key-type
track: go
orderIndex: 71
title: Context Value Lost with String Key
difficulty: easy
tags:
  - context
  - errors
  - correctness
language: go
---

## Context

This code is spread across `middleware/auth.go` and `handler/profile.go` in a REST API built with `net/http`. The middleware extracts a user ID from a JWT and stores it in the request context. The handler retrieves it to authorise the response.

In production, the handler always falls through to the "unauthorized" branch even for fully authenticated requests. Logs show the JWT is valid and the middleware runs successfully, but `ctx.Value("userID")` returns nil in the handler. No errors are returned by the middleware.

The developer added log lines to confirm the middleware is setting the value and the handler is reading from the same request context — the logs confirm both sides run, yet the value is never found.

## Buggy code

```go
package main

import (
	"context"
	"fmt"
	"net/http"
)

// middleware/auth.go
func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := extractUserID(r)
		ctx := context.WithValue(r.Context(), "userID", userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// handler/profile.go
type contextKey string

const userIDKey contextKey = "userID"

func ProfileHandler(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value(userIDKey).(string)
	if !ok || userID == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	fmt.Fprintf(w, "hello %s", userID)
}

func extractUserID(r *http.Request) string { return "alice" }

func main() {}
```
