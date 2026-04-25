---
slug: error-check-after-defer
track: go
orderIndex: 51
title: Error Check Before Deferred Close
difficulty: easy
tags:
  - errors
  - correctness
  - io
language: go
---

## Context

This function is in `cmd/importer/main.go`. It reads a CSV file, parses each row, and bulk-inserts the records into a database. The pattern of opening a file, deferring its close, and checking the error from `os.Open` is common throughout the codebase.

On systems where the file does not exist, instead of a clear 'file not found' error, the process occasionally panics with `invalid memory address or nil pointer dereference` on the `defer f.Close()` line. Developers reproducing the issue locally on Linux do not see the panic, but CI (macOS) does.

The panic is not consistent — sometimes the error is returned cleanly and sometimes the panic occurs, which makes the team suspect a scheduler or timing issue, but the root cause is simpler.

## Buggy code

```go
package main

import (
	"encoding/csv"
	"fmt"
	"os"
)

type Record struct {
	Name  string
	Email string
}

func importCSV(path string) ([]Record, error) {
	f, err := os.Open(path)
	defer f.Close()
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}

	var records []Record
	r := csv.NewReader(f)
	rows, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read csv: %w", err)
	}
	for _, row := range rows {
		if len(row) < 2 {
			continue
		}
		records = append(records, Record{Name: row[0], Email: row[1]})
	}
	return records, nil
}
```
