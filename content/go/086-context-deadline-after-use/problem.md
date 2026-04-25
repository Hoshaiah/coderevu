---
slug: context-deadline-after-use
track: go
orderIndex: 86
title: Deadline Set After Blocking Call
difficulty: hard
tags:
  - context
  - errors
  - correctness
language: go
---

## Context

The snippet lives in `cmd/migrator/main.go`, a database migration runner that must complete within a configurable wall-clock budget. If the migration takes longer than the budget, the runner should abort and return an error so the deployment pipeline can retry or alert.

Operators report that the migrator sometimes runs for much longer than the configured 30-second timeout — occasionally for minutes — without aborting. The timeout appears to be completely ignored. The `ctx.Err()` check at the end sometimes returns `nil` even after several minutes have elapsed.

The team has verified that `timeout` is parsed correctly from the environment variable and that `runMigrations` does respect context cancellation (it polls `ctx.Done()` inside its loop). The bug is in how the context is set up.

## Buggy code

```go
package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"time"
)

func main() {
	secs, _ := strconv.Atoi(os.Getenv("MIGRATION_TIMEOUT_SECS"))
	if secs == 0 {
		secs = 30
	}

	ctx := context.Background()

	err := runMigrations(ctx)

	ctx, cancel := context.WithTimeout(ctx, time.Duration(secs)*time.Second)
	defer cancel()

	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}
	if ctx.Err() != nil {
		log.Fatal("migration timed out")
	}
	log.Println("migrations complete")
}
```
