---
slug: select-on-nil-channel
track: go
orderIndex: 39
title: Select Blocks on Nil Channel
difficulty: hard
tags:
  - channels
  - goroutines
  - concurrency
language: go
---

## Context

This merge function lives in `pkg/stream/merge.go` and is intended to fan-in two optional event streams into one. Either `a` or `b` can be `nil` to indicate that stream is absent — a deliberate design choice so callers can enable/disable streams at runtime without changing the merge plumbing.

When only one channel is passed (the other is `nil`), the function is supposed to simply forward from the non-nil channel. Instead, callers observe that the merged output receives only some events and then stalls unpredictably. The function never returns. CPU usage is near zero so it is not a busy-loop.

The team ruled out producer bugs — both streams produce the correct number of events in isolation. The stall only occurs when one argument is `nil`.

## Buggy code

```go
package stream

func Merge(a, b <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		aOpen, bOpen := true, true
		for aOpen || bOpen {
			select {
			case v, ok := <-a:
				if !ok {
					aOpen = false
					continue
				}
				out <- v
			case v, ok := <-b:
				if !ok {
					bOpen = false
					continue
				}
				out <- v
			}
		}
	}()
	return out
}
```
