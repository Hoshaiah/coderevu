---
slug: channel-close-double-receive-panic
track: go
orderIndex: 30
title: Panic Closing Already-Closed Channel
difficulty: easy
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This code is in `pkg/broker/fanout.go`, part of an event broker that distributes incoming messages to multiple subscriber goroutines. The `done` channel is used to signal all subscribers to stop. The broker is created once at startup and torn down on SIGTERM.

The service panics in production a few seconds after receiving a shutdown signal with `close of closed channel`. The panic happens in the `shutdown` path, which operators believed was safe because it is only called once.

After investigation, the team found that two goroutines — the signal handler and an HTTP `/drain` endpoint — both call `Shutdown` if a graceful drain is requested via the HTTP endpoint while the OS signal arrives simultaneously.

## Buggy code

```go
package broker

import "sync"

type Broker struct {
	done chan struct{}
	wg   sync.WaitGroup
}

func NewBroker() *Broker {
	return &Broker{done: make(chan struct{})}
}

func (b *Broker) Subscribe(id int, handle func(int)) {
	b.wg.Add(1)
	go func() {
		defer b.wg.Done()
		for {
			select {
			case <-b.done:
				return
			default:
				handle(id)
			}
		}
	}()
}

func (b *Broker) Shutdown() {
	close(b.done)
	b.wg.Wait()
}
```
