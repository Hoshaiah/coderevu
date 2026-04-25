---
slug: error-ignored-in-goroutine-launch
track: go
orderIndex: 63
title: Error Lost in Fire-and-Forget
difficulty: medium
tags:
  - errors
  - goroutines
  - concurrency
language: go
---

## Context

This code lives in `internal/notify/dispatcher.go`, a notification dispatcher that sends webhook callbacks to registered endpoints after a payment event. It is called from the payment processing flow after a transaction is persisted. The function is intentionally asynchronous so it doesn't block the payment response.

The team starts seeing silent failures: webhooks are not being delivered, but the payment API continues to return HTTP 200. There are no error logs from the notification system. A product manager reports that customers are missing order confirmation emails that depend on the webhooks.

The team has already confirmed the `sendWebhook` function itself correctly returns errors when the HTTP call fails. They also checked that the endpoints are reachable. The issue is upstream of `sendWebhook` in how errors are surfaced.

## Buggy code

```go
package notify

import (
	"fmt"
	"log"
)

type Event struct {
	OrderID string
	Amount  float64
}

func Dispatch(endpoints []string, evt Event) {
	for _, ep := range endpoints {
		go func(url string) {
			if err := sendWebhook(url, evt); err != nil {
				// retry once
				if err := sendWebhook(url, evt); err != nil {
					return
				}
			}
		}(ep)
	}
}

func sendWebhook(url string, evt Event) error {
	// real implementation does HTTP POST
	return fmt.Errorf("connection refused: %s", url)
}

func init() { log.SetFlags(0) }
```
