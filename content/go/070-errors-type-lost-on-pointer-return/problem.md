---
slug: errors-type-lost-on-pointer-return
track: go
orderIndex: 70
title: Concrete Error Type Lost in Return
difficulty: hard
tags:
  - errors
  - correctness
  - api-misuse
language: go
---

## Context

This code lives in `pkg/payment/charge.go`. The payment service uses a custom `*DeclineError` type to signal soft declines (which the caller should retry with a different payment method) versus hard errors (network failures, etc.). The caller uses a type assertion to distinguish them.

Callers consistently find that `errors.As(err, &declineErr)` returns `false` even when a card is declined, causing soft declines to be treated as hard failures. Users receive generic error messages instead of being prompted to try another card, which has measurable impact on conversion rate.

The team added debug logging and confirmed that inside `chargeCard`, `DeclineError` is being returned with the correct fields populated. The type assertion fails at the call boundary. They suspect an interface boxing issue but cannot pinpoint it.

## Buggy code

```go
package payment

import "fmt"

type DeclineError struct {
	Code    string
	Message string
}

func (e *DeclineError) Error() string {
	return fmt.Sprintf("card declined [%s]: %s", e.Code, e.Message)
}

func chargeCard(token string, amount int) error {
	// Simulate a declined charge.
	var err *DeclineError
	if amount > 10000 {
		err = &DeclineError{Code: "insufficient_funds", Message: "not enough balance"}
	}
	// Other processing...
	return err
}

func ProcessPayment(token string, amount int) error {
	if err := chargeCard(token, amount); err != nil {
		return fmt.Errorf("payment processing failed: %w", err)
	}
	return nil
}
```
