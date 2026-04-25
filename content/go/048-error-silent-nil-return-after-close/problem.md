---
slug: error-silent-nil-return-after-close
track: go
orderIndex: 48
title: Closed Writer Error Silently Dropped
difficulty: easy
tags:
  - errors
  - io
  - correctness
language: go
---

## Context

This helper lives in `pkg/export/csv.go`. It writes a CSV report to a file: it marshals rows, writes them, then explicitly closes the file. The function is called from a nightly ETL job that exports billing records. If the export fails the job is supposed to retry.

Operators noticed the ETL job reports success even on nights when the exported file is empty or truncated. Adding extra logging revealed that `os.File.Close` occasionally returns an error (the underlying filesystem occasionally flushes buffered data on close and can propagate I/O errors), but the job never sees it.

The team confirmed that `writeRows` returns errors correctly and those are being checked. The problem is specifically in what happens after `f.Close()` is called.

## Buggy code

```go
package export

import (
	"encoding/csv"
	"fmt"
	"os"
)

type Row struct {
	ID    string
	Amount string
}

func writeRows(w *csv.Writer, rows []Row) error {
	for _, r := range rows {
		if err := w.Write([]string{r.ID, r.Amount}); err != nil {
			return fmt.Errorf("write row: %w", err)
		}
	}
	w.Flush()
	return w.Error()
}

func ExportToFile(path string, rows []Row) error {
	f, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer f.Close()

	w := csv.NewWriter(f)
	if err := writeRows(w, rows); err != nil {
		return fmt.Errorf("write rows: %w", err)
	}

	return nil
}
```
