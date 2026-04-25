---
slug: error-deferred-named-return-ignored
track: go
orderIndex: 61
title: Deferred Error Overwrites Real Error
difficulty: medium
tags:
  - errors
  - correctness
  - defer
language: go
---

## Context

This function is in `internal/storage/writer.go`. It opens a temporary file, writes a batch of records, then atomically renames it into place. It uses a named return value so the deferred close can capture and return any close error.

In testing, some callers receive a `nil` error even when the write failed — for instance when the disk is full. Operators only discover data loss after the fact when the destination file is empty or truncated.

The team confirmed the `Write` call does return an error in those cases and that the deferred `Close` call succeeds (returns nil). They have not yet looked closely at how the named return interacts with the deferred assignment.

## Buggy code

```go
package storage

import (
	"fmt"
	"os"
)

func writeBatch(dst string, records [][]byte) (err error) {
	tmp, err := os.CreateTemp("", "batch-*")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	defer func() {
		cErr := tmp.Close()
		if cErr != nil {
			err = fmt.Errorf("close temp: %w", cErr)
		}
	}()

	for _, rec := range records {
		if _, wErr := tmp.Write(rec); wErr != nil {
			return fmt.Errorf("write: %w", wErr)
		}
	}

	if err = os.Rename(tmp.Name(), dst); err != nil {
		return fmt.Errorf("rename: %w", err)
	}
	return nil
}
```
