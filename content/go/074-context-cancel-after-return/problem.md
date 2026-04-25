---
slug: context-cancel-after-return
track: go
orderIndex: 74
title: Context Cancel Called After Return
difficulty: easy
tags:
  - context
  - resource-management
  - goroutines
language: go
---

## Context

This function is in `internal/rpc/client.go`. It creates a timeout context, makes an outbound gRPC call, and is expected to clean up the context's resources when done. The function is called thousands of times per minute in a high-throughput microservice.

Operators observed that the process file-descriptor count climbs over time and the Go runtime's goroutine count includes a growing number of goroutines with stack traces inside `time.AfterFunc`. Eventually the OS refuses new connections with `too many open files`. Profiling confirmed these are timer goroutines that were never released.

The team checked the gRPC connection pool and found no leak there. The leak was reproducible in a unit test with `goleak` which pointed to lingering `timerCtx` goroutines.

## Buggy code

```go
package rpc

import (
	"context"
	"time"
)

type Response struct{ Data []byte }

func CallWithTimeout(ctx context.Context, call func(context.Context) (*Response, error)) (*Response, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, 5*time.Second)

	resp, err := call(timeoutCtx)
	if err != nil {
		return nil, err
	}

	cancel()
	return resp, nil
}
```
