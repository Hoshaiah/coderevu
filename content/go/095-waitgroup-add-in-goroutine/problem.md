---
slug: waitgroup-add-in-goroutine
track: go
orderIndex: 95
title: WaitGroup Add called inside goroutine causes Wait to return too early
difficulty: medium
tags:
  - concurrency
  - sync
  - waitgroup
  - goroutines
language: go
---

## Context

This ETL pipeline fans out work to a pool of goroutines and waits for all of them to finish before writing a summary record. In staging, the summary is occasionally written before all workers have completed, resulting in incomplete aggregate counts. The bug is timing-dependent and disappears under a debugger.

## Buggy code

```go
package etl

import (
	"sync"
)

type Record struct{ Value int }

func Process(records []Record, handle func(Record)) {
	var wg sync.WaitGroup
	for _, rec := range records {
		rec := rec
		go func() {
			wg.Add(1)
			defer wg.Done()
			handle(rec)
		}()
	}
	wg.Wait()
}

func WriteSummary() { /* write aggregate counts */ }
```
