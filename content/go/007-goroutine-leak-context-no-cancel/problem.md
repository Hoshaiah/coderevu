---
slug: goroutine-leak-context-no-cancel
track: go
orderIndex: 7
title: Goroutine Leaks Without Context Cancel
difficulty: easy
tags:
  - goroutines
  - context
  - resource-management
language: go
---

## Context

This code lives in `internal/poller/poller.go`, a background polling service that periodically checks an external API and sends results down a channel. It is started once at application boot and is expected to run until the process exits or a shutdown signal is received.

Operators noticed that after calling `Stop()` the process memory keeps climbing and the number of goroutines (visible via `pprof`) never decreases. Each call to `Start()` followed by `Stop()` leaves behind a goroutine that blocks forever on a channel send.

The team verified the channel is being drained downstream and ruled out a consumer-side deadlock. They also confirmed `Stop()` is always called exactly once.

## Buggy code

```go
package poller

import (
	"context"
	"time"
)

type Poller struct {
	out  chan string
	stop chan struct{}
}

func NewPoller() *Poller {
	return &Poller{
		out:  make(chan string),
		stop: make(chan struct{}),
	}
}

func (p *Poller) Start() {
	ctx := context.Background()
	go func() {
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				result := fetchResult(ctx)
				p.out <- result
			case <-p.stop:
				return
			}
		}
	}()
}

func (p *Poller) Stop() {
	p.stop <- struct{}{}
}

func (p *Poller) Out() <-chan string { return p.out }

func fetchResult(ctx context.Context) string { return "data" }
```
