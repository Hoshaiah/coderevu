---
slug: channel-nil-send-blocks-forever
track: go
orderIndex: 27
title: Send on Nil Channel Deadlocks
difficulty: easy
tags:
  - channels
  - goroutines
  - deadlock
language: go
---

## Context

This utility is in `pkg/fanout/fanout.go`. It implements a simple fan-out helper: callers register output channels and then broadcast a value to all of them. It is used by a real-time dashboard that pushes price updates to multiple subscribers.

During integration testing the team noticed that if a subscriber channel is closed by the receiver and then the subscriber is "unregistered" by setting the slot to nil, a subsequent broadcast call hangs the entire process forever instead of skipping the nil entry.

The team confirmed the nil assignment happens-before the next Broadcast call and so assumed it was safe to skip. They did not realize nil channels have a specific behavior inside a select.

## Buggy code

```go
package fanout

type Broadcaster struct {
	subs []chan string
}

func NewBroadcaster(n int) *Broadcaster {
	subs := make([]chan string, n)
	for i := range subs {
		subs[i] = make(chan string, 1)
	}
	return &Broadcaster{subs: subs}
}

func (b *Broadcaster) Unsubscribe(index int) {
	b.subs[index] = nil
}

func (b *Broadcaster) Broadcast(msg string) {
	for _, ch := range b.subs {
		select {
		case ch <- msg:
		default:
			// subscriber full, drop message
		}
	}
}

func (b *Broadcaster) Sub(index int) <-chan string {
	return b.subs[index]
}
```
