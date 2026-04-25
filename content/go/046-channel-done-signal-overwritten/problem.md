---
slug: channel-done-signal-overwritten
track: go
orderIndex: 46
title: Done Channel Replaced Under Readers
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
  - correctness
language: go
---

## Context

This code is in `internal/broker/subscription.go`. It implements a simple pub/sub mechanism for an in-process event broker. Subscribers call `Subscribe` to get a channel that emits events, and `Reset` is called when the subscription needs to restart (e.g., after reconnecting to a remote source).

Under concurrent load, subscribers occasionally report receiving no events after a reset even though events are being published, or they panic with `send on closed channel`. The bug is non-deterministic and harder to reproduce on machines with fewer cores.

The team has verified the publisher loop is running and producing events. They added mutex protection around `publish` calls and confirmed those are serialised. The problem appears to involve the interaction between `Reset` and active goroutines reading from the subscription channel.

## Buggy code

```go
package broker

import "sync"

type Subscription struct {
	mu  sync.Mutex
	ch  chan string
}

func NewSubscription() *Subscription {
	return &Subscription{ch: make(chan string, 64)}
}

// Subscribe returns the current event channel.
func (s *Subscription) Subscribe() <-chan string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.ch
}

// Publish sends an event to all current subscribers.
func (s *Subscription) Publish(event string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ch <- event
}

// Reset closes the old channel and creates a new one.
func (s *Subscription) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	close(s.ch)
	s.ch = make(chan string, 64)
}
```
