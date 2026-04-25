---
slug: nil-pointer-interface-check
track: go
orderIndex: 98
title: Non-nil interface wrapping nil pointer passes nil check and panics later
difficulty: hard
tags:
  - interfaces
  - nil
  - correctness
  - type-system
language: go
---

## Context

This notification service selects a sender implementation at startup based on configuration. Operators reported that when `SMTP_HOST` is unset the service starts without complaint, but the first attempt to send a notification panics with a nil pointer dereference deep inside the SMTP code path, even though the initialization function checked for nil and logged a warning.

## Buggy code

```go
package notify

import (
	"fmt"
	"os"
)

type Sender interface {
	Send(to, body string) error
}

type SMTPSender struct {
	Host string
}

func (s *SMTPSender) Send(to, body string) error {
	if s.Host == "" {
		return fmt.Errorf("smtp: no host configured")
	}
	fmt.Printf("sending to %s via %s\n", to, s.Host)
	return nil
}

func NewSender() Sender {
	var s *SMTPSender
	if host := os.Getenv("SMTP_HOST"); host != "" {
		s = &SMTPSender{Host: host}
	}
	return s
}

func InitService() {
	sender := NewSender()
	if sender == nil {
		fmt.Println("warning: no sender configured")
		return
	}
	sender.Send("ops@example.com", "service started")
}
```
