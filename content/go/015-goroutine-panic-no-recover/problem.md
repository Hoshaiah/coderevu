---
slug: goroutine-panic-no-recover
track: go
orderIndex: 15
title: Panic Crashes Entire HTTP Server
difficulty: medium
tags:
  - goroutines
  - errors
  - concurrency
language: go
---

## Context

This code is in `internal/export/worker.go`. When a user requests a data export, the HTTP handler validates the request and then delegates to `StartExport`, which performs the heavy work in a background goroutine so the handler can return immediately with a 202 Accepted. The export goroutine writes to a file and sends a webhook when done.

Operators report that roughly once a day the entire service crashes with a panic originating from the export goroutine. The panic comes from a nil pointer dereference in a third-party library used inside `runExport`. Because the panic happens in a goroutine that was not launched by the HTTP server's built-in recover middleware, it is unrecovered and kills the entire process.

The team has a `recover()` at the top of every HTTP handler added by middleware, but they forgot that middleware-level recover does not cross goroutine boundaries — a panic in a child goroutine is not caught by the parent's deferred recover.

## Buggy code

```go
package export

import (
	"log"
	"time"
)

type ExportJob struct {
	UserID   int
	Format   string
	FilePath string
}

func StartExport(job ExportJob) {
	go func() {
		if err := runExport(job); err != nil {
			log.Printf("export failed for user %d: %v", job.UserID, err)
		}
	}()
}

func runExport(job ExportJob) error {
	time.Sleep(2 * time.Second) // simulate work
	// third-party lib may panic on malformed input
	return nil
}
```
