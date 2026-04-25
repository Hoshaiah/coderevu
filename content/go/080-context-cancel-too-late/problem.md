---
slug: context-cancel-too-late
track: go
orderIndex: 80
title: Context Cancelled After Work Done
difficulty: medium
tags:
  - context
  - errors
  - resource-management
language: go
---

## Context

This handler is in `api/handlers/upload.go`. It accepts a file upload, stores the bytes in object storage, then writes a metadata record to Postgres. The handler creates a per-request context with a 30-second deadline to bound the entire operation.

Under load, operators observed that Postgres connections are being exhausted even though the average upload completes in under 5 seconds. `pprof` showed many goroutines blocked inside `db.ExecContext`. Closer inspection revealed the context passed to the DB call was already cancelled at the time of the call.

The team checked that the 30-second timeout was generous enough and that no upstream proxy was closing connections early.

## Buggy code

```go
package handlers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

var db interface {
	ExecContext(ctx context.Context, query string, args ...any) (any, error)
}
var storage interface {
	Put(ctx context.Context, key string, r io.Reader) error
}

func UploadHandler(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	key := r.URL.Query().Get("key")
	if err := storage.Put(ctx, key, r.Body); err != nil {
		http.Error(w, "storage error", http.StatusInternalServerError)
		return
	}

	if err := writeMetadata(ctx, key); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func writeMetadata(ctx context.Context, key string) error {
	_, err := db.ExecContext(ctx, "INSERT INTO uploads(key) VALUES($1)", key)
	return fmt.Errorf("insert: %w", err)
}
```
