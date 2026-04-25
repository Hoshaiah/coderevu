---
slug: channel-buffered-drop-silently
track: go
orderIndex: 28
title: Buffered Channel Silently Drops Events
difficulty: easy
tags:
  - channels
  - concurrency
  - correctness
language: go
---

## Context

This code lives in `internal/audit/emitter.go`. An HTTP middleware calls `Emit` on every request to record audit events asynchronously without blocking the request path. The background goroutine drains the channel and writes events to a database.

Under normal load everything looks fine, but during traffic spikes the audit log silently shows gaps — some requests have no corresponding audit event even though the middleware always calls `Emit`. There are no error logs from the emitter.

The team added metrics and confirmed that requests are reaching the middleware. They suspect a queue overflow but cannot figure out why no error is surfaced.

## Buggy code

```go
package audit

import "log"

type Event struct {
	UserID string
	Action string
}

type Emitter struct {
	ch chan Event
}

func NewEmitter() *Emitter {
	e := &Emitter{ch: make(chan Event, 512)}
	go e.drain()
	return e
}

func (e *Emitter) Emit(ev Event) {
	select {
	case e.ch <- ev:
	default:
		// channel full, drop silently
	}
}

func (e *Emitter) drain() {
	for ev := range e.ch {
		if err := writeToDatabase(ev); err != nil {
			log.Printf("audit write error: %v", err)
		}
	}
}

func writeToDatabase(ev Event) error { return nil }
```
