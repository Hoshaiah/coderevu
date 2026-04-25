---
slug: channel-send-goroutine-no-select
track: go
orderIndex: 35
title: Send Blocks When Receiver Is Gone
difficulty: medium
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This code is in `internal/notify/dispatcher.go`. A `Dispatcher` distributes notifications to registered subscriber channels. Each subscriber is expected to be a short-lived HTTP handler that reads from its channel once and then disconnects.

Under high concurrency the dispatcher goroutine occasionally hangs indefinitely. `pprof` shows it blocked on a channel send. This blocks all subsequent notifications from being delivered to any other subscriber.

The team confirmed that when an HTTP client disconnects mid-stream, the handler exits without draining its channel. They are not sure why the send doesn't just fail or time out.

## Buggy code

```go
package notify

type Dispatcher struct {
	subscribers []chan string
}

func (d *Dispatcher) Register() chan string {
	ch := make(chan string, 1)
	d.subscribers = append(d.subscribers, ch)
	return ch
}

func (d *Dispatcher) Broadcast(msg string) {
	for _, ch := range d.subscribers {
		ch <- msg
	}
}

func (d *Dispatcher) Unregister(ch chan string) {
	for i, sub := range d.subscribers {
		if sub == ch {
			d.subscribers = append(d.subscribers[:i], d.subscribers[i+1:]...)
			return
		}
	}
}
```
