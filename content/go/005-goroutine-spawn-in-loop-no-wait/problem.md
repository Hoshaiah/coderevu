---
slug: goroutine-spawn-in-loop-no-wait
track: go
orderIndex: 5
title: Fan-Out Without WaitGroup Exits Early
difficulty: easy
tags:
  - goroutines
  - concurrency
  - correctness
language: go
---

## Context

This function is in `cmd/migrate/main.go`. It runs database schema migrations for a list of tenant databases concurrently, then prints a summary. The expectation is that all migrations complete before `MigrateAll` returns and the process exits.

The development team sees that when running the tool locally with three or more tenant databases, the tool often exits with no output for some tenants — as if their migrations never ran. Adding a `time.Sleep` at the end of `main` makes all tenants appear, which strongly suggests the process exits before the goroutines finish.

The team already checked that `migrate` (the per-tenant function) runs correctly in isolation. The bug is in `MigrateAll`.

## Buggy code

```go
package main

import (
	"fmt"
	"log"
)

type DB struct{ Name string }

func migrate(db DB) error {
	fmt.Printf("migrated %s\n", db.Name)
	return nil
}

func MigrateAll(dbs []DB) {
	results := make(chan error, len(dbs))

	for _, db := range dbs {
		db := db
		go func() {
			results <- migrate(db)
		}()
	}

	for range dbs {
		if err := <-results; err != nil {
			log.Printf("migration error: %v", err)
		}
	}
}

func main() {
	dbs := []DB{{"tenantA"}, {"tenantB"}, {"tenantC"}}
	go MigrateAll(dbs)
	fmt.Println("migrations started")
}
```
