---
slug: channel-timer-drain-missing
track: go
orderIndex: 34
title: Timer Channel Not Drained on Reset
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This retry helper lives in `pkg/retry/backoff.go`. It implements exponential backoff with a cap and is used by several RPC clients to retry transient failures. The `Reset` method is called each time a new attempt should begin, reusing a single `time.Timer` for efficiency.

During load testing, the team saw retries firing immediately on consecutive failures instead of waiting for the backoff interval. Adding metrics revealed that the timer's `C` channel was delivering an old tick on the very next `Wait` call, making the retry appear instantaneous.

The team confirmed that `Reset` is always called before `Wait` and that the timer is not used concurrently.

## Buggy code

```go
package retry

import (
	"time"
)

type Backoff struct {
	timer    *time.Timer
	current  time.Duration
	max      time.Duration
}

func NewBackoff(initial, max time.Duration) *Backoff {
	return &Backoff{
		timer:   time.NewTimer(initial),
		current: initial,
		max:     max,
	}
}

func (b *Backoff) Reset() {
	b.current *= 2
	if b.current > b.max {
		b.current = b.max
	}
	b.timer.Reset(b.current)
}

func (b *Backoff) Wait() {
	<-b.timer.C
}

func (b *Backoff) Stop() {
	b.timer.Stop()
}
```
