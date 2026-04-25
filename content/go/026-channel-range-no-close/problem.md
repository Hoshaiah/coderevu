---
slug: channel-range-no-close
track: go
orderIndex: 26
title: Range Over Channel Hangs Forever
difficulty: easy
tags:
  - channels
  - goroutines
  - correctness
language: go
---

## Context

This code is in `pkg/export/csv.go`, a small utility that streams records from a generator function into a CSV writer. The design uses a channel so the generator and the CSV writer run concurrently, keeping the pipeline flowing without buffering all records in memory.

When the exporter is called, it produces the correct CSV content but never returns to the caller. The HTTP handler wrapping it times out waiting for `ExportCSV` to finish. Adding log lines shows that all records are processed, but execution is stuck after the last record.

The team confirmed the `generate` function does terminate — it returns after sending all records. The CSV writing logic is also correct. The hang is somewhere in the channel/goroutine coordination.

## Buggy code

```go
package export

import (
	"encoding/csv"
	"io"
	"strconv"
)

type Record struct {
	ID    int
	Value string
}

func ExportCSV(w io.Writer, records []Record) error {
	ch := make(chan Record)

	go generate(ch, records)

	csvW := csv.NewWriter(w)
	for rec := range ch {
		if err := csvW.Write([]string{strconv.Itoa(rec.ID), rec.Value}); err != nil {
			return err
		}
	}
	csvW.Flush()
	return csvW.Error()
}

func generate(ch chan Record, records []Record) {
	for _, r := range records {
		ch <- r
	}
}
```
