---
slug: context-value-interface-key
track: go
orderIndex: 92
title: Context Key Collision via String Type
difficulty: hard
tags:
  - context
  - correctness
  - security
language: go
---

## Context

This code is split across two packages: `pkg/auth/middleware.go` stores the authenticated user ID in the request context, and `pkg/audit/middleware.go` retrieves a correlation ID from the same context. Both were written by different teams and are composed in `cmd/api/main.go` as HTTP middleware layers.

Occasionally, audit log entries show the wrong correlation ID — specifically, it matches the authenticated user ID. The bug only manifests when a request passes through both middleware layers and the user happens to have a numeric string ID whose format matches a UUID. No errors are returned anywhere, and the logs show values that look plausible, making the bug very hard to catch in testing.

The security team flagged a log anomaly during a compliance review. Code review revealed both packages use the same underlying key type for `context.WithValue`.

## Buggy code

```go
package auth

import (
	"context"
	"net/http"
)

func UserMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID := r.Header.Get("X-User-ID")
		ctx := context.WithValue(r.Context(), "userID", userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetUserID(ctx context.Context) string {
	v, _ := ctx.Value("userID").(string)
	return v
}

// --- pkg/audit/middleware.go ---

// package audit
//
// import (
// 	"context"
// 	"net/http"
// )
//
// func CorrelationMiddleware(next http.Handler) http.Handler {
// 	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		corrID := r.Header.Get("X-Correlation-ID")
// 		// BUG: same plain string key "userID" used by accident (copy-paste)
// 		ctx := context.WithValue(r.Context(), "userID", corrID)
// 		next.ServeHTTP(w, r.WithContext(ctx))
// 	})
// }
//
// func GetCorrelationID(ctx context.Context) string {
// 	v, _ := ctx.Value("userID").(string)
// 	return v
// }
```
