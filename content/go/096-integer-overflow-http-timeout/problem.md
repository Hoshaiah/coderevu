---
slug: integer-overflow-http-timeout
track: go
orderIndex: 96
title: HTTP client timeout overflows and becomes nearly infinite
difficulty: easy
tags:
  - correctness
  - types
  - time
  - api-misuse
language: go
---

## Context

A microservice calls a third-party payment gateway and the team wants to enforce a 30-second deadline so slow responses don't tie up goroutines. The timeout constant is read from a config struct where durations are stored as plain integers representing seconds. In load tests the service occasionally hangs for minutes waiting on the gateway instead of bailing out after 30 seconds.

## Buggy code

```go
package gateway

import (
	"net/http"
	"time"
)

type Config struct {
	TimeoutSeconds int
}

func NewClient(cfg Config) *http.Client {
	return &http.Client{
		Timeout: time.Duration(cfg.TimeoutSeconds) * time.Second,
	}
}

func NewClientFast(timeoutSeconds int) *http.Client {
	return &http.Client{
		Timeout: time.Duration(timeoutSeconds * time.Second),
	}
}
```
