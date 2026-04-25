---
slug: deferred-close-swallows-error
track: go
orderIndex: 97
title: Deferred file close silently discards the write error
difficulty: easy
tags:
  - error-handling
  - io
  - defer
  - resource-management
language: go
---

## Context

This utility function is part of a data-export pipeline that writes CSV snapshots to disk. The function is called in a nightly batch job. QA has noticed that occasionally the exported files are truncated or empty on the next morning, yet the job logs show no errors and exits with code 0.

## Buggy code

```go
package export

import (
	"encoding/csv"
	"os"
)

func WriteCSV(path string, records [][]string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()

	w := csv.NewWriter(f)
	if err := w.WriteAll(records); err != nil {
		return err
	}
	w.Flush()
	return w.Error()
}
```
