---
slug: error-comparison-pointer-vs-value
track: go
orderIndex: 56
title: Sentinel Error Never Matches
difficulty: medium
tags:
  - errors
  - error-handling
  - api-misuse
language: go
---

## Context

This code is in `pkg/queue/errors.go` and `pkg/queue/consumer.go`. The queue consumer is supposed to detect a specific "queue empty" condition and return `ErrQueueEmpty` so callers can back off and retry without logging a noisy error. Callers use `errors.Is(err, ErrQueueEmpty)` to detect this case.

In production, every poll logs an error during off-peak hours (when the queue is genuinely empty), suggesting that `errors.Is` is never matching `ErrQueueEmpty`. The alert noise has caused alert fatigue and real errors are being missed. The on-call engineer confirmed via `fmt.Println` that the returned error message is exactly "queue is empty" — matching what `ErrQueueEmpty.Error()` returns.

The team suspected a wrapping issue but `errors.Is` should unwrap correctly. The bug is more fundamental: the sentinel value itself is defined in a way that makes equality comparison always fail.

## Buggy code

```go
package queue

import "errors"

// ErrQueueEmpty is returned when the queue has no items.
var ErrQueueEmpty = errors.New("queue is empty")

type Consumer struct{}

func (c *Consumer) Poll() error {
	empty := true // simulate empty queue check
	if empty {
		return newQueueEmptyError()
	}
	return nil
}

func newQueueEmptyError() error {
	// returns a fresh error each time to include a timestamp or context
	return errors.New("queue is empty")
}
```
