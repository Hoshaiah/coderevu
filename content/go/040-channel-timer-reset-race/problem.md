---
slug: channel-timer-reset-race
track: go
orderIndex: 40
title: Timer Reset Race Condition
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This code is in `internal/session/timeout.go`. It implements an idle-session timer: each time the user performs an action, `Reset` is called to extend the session. If the timer fires without being reset, the session is expired. This is used in a WebSocket server where each connection has its own `SessionTimer`.

Under load testing with concurrent `Reset` calls, the service occasionally logs "session expired" for sessions that are actively being used. The bug is intermittent and hard to reproduce — it only appears with multiple goroutines calling `Reset` concurrently — but `go test -race` is clean, which has misled the team into thinking there is no concurrency issue.

`go test -race` being clean does not prove the logic is correct — it only proves there are no data races. A logic race (a race in control flow without shared memory) can still cause incorrect behavior.

## Buggy code

```go
package session

import "time"

type SessionTimer struct {
	timer   *time.Timer
	onExpire func()
}

func NewSessionTimer(timeout time.Duration, onExpire func()) *SessionTimer {
	st := &SessionTimer{onExpire: onExpire}
	st.timer = time.AfterFunc(timeout, onExpire)
	return st
}

func (st *SessionTimer) Reset(timeout time.Duration) {
	st.timer.Stop()
	st.timer.Reset(timeout)
}
```
