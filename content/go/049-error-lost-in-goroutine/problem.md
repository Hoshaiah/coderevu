---
slug: error-lost-in-goroutine
track: go
orderIndex: 49
title: Errors Silently Dropped in Goroutine
difficulty: easy
tags:
  - errors
  - goroutines
  - observability
language: go
---

## Context

This function is in `internal/importer/csv.go`. It reads a CSV file and processes each row concurrently using a goroutine pool. It is called from a nightly ETL job that ingests sales records from a partner's SFTP drop.

Operators noticed that some nights the import "succeeds" (exit code 0, no alert fired) but the database has fewer rows than expected. The discrepancy can be hundreds of records. No errors appear in the log for those runs.

The team added extra logging around the DB write and confirmed the issue is upstream: rows are being skipped silently. Disk and network were ruled out.

## Buggy code

```go
package importer

import (
	"encoding/csv"
	"fmt"
	"io"
	"sync"
)

func ImportCSV(r io.Reader, store func(record []string) error) error {
	reader := csv.NewReader(r)
	var wg sync.WaitGroup
	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read error: %w", err)
		}
		wg.Add(1)
		go func(rec []string) {
			defer wg.Done()
			_ = store(rec)
		}(record)
	}
	wg.Wait()
	return nil
}
```
