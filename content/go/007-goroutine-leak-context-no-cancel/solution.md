## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Goroutine Leaks Without Context Cancel
// ------------------------------------------------------------------------

package poller

import (
	"context"
	"time"
)

type Poller struct {
	out    chan string
	stop   chan struct{}
	// CHANGE 2: store a cancel func so we can cancel in-flight fetchResult calls and recreate stop on each Start
	cancel context.CancelFunc
}

func NewPoller() *Poller {
	return &Poller{
		out:  make(chan string),
		stop: make(chan struct{}),
	}
}

func (p *Poller) Start() {
	// CHANGE 2: create a fresh stop channel each time Start is called so a second Start after Stop works correctly
	p.stop = make(chan struct{})
	// CHANGE 1: derive a cancellable context and store its cancel func so we can unblock or abandon fetchResult when Stop is called
	ctx, cancel := context.WithCancel(context.Background())
	p.cancel = cancel
	go func() {
		defer cancel()
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				result := fetchResult(ctx)
				// CHANGE 1: use a select so that a concurrent Stop() signal is not missed while we attempt to send the result
				select {
				case p.out <- result:
				case <-p.stop:
					return
				}
			case <-p.stop:
				return
			}
		}
	}()
}

func (p *Poller) Stop() {
	// CHANGE 2: cancel the context first so any in-progress fetchResult can bail out early if it respects ctx
	if p.cancel != nil {
		p.cancel()
	}
	p.stop <- struct{}{}
}

func (p *Poller) Out() <-chan string { return p.out }

func fetchResult(ctx context.Context) string { return "data" }
```

## Explanation

### Issue 1: Blocking send ignores stop signal

**Problem:** After `fetchResult` returns a result, the goroutine executes `p.out <- result`. If the downstream consumer is not ready at exactly that moment and `Stop()` is called concurrently, the goroutine blocks forever on the channel send. The outer `select` is no longer being evaluated, so the `p.stop` case is never reached and the goroutine leaks. Operators see the goroutine count grow by one for every Start/Stop cycle in `pprof`.

**Fix:** Replace the bare `p.out <- result` statement with a nested `select` that races the send against `<-p.stop`. When `Stop()` fires its signal, the inner `select` picks it up and the goroutine returns cleanly.

**Explanation:** A `select` statement in Go only runs once — it picks one ready case and then execution falls out of the `select` block. Once the goroutine leaves the outer `select` and enters the blocking send `p.out <- result`, it is no longer listening on `p.stop`. If `Stop()` sends to `p.stop` at this point, the signal is consumed by `Stop()` itself (since `Stop` does a synchronous send) but the goroutine never wakes up on it — instead `Stop()` blocks too, creating a deadlock. With the nested `select`, both the send and the stop signal are waited on simultaneously, so whichever happens first wins. A related pitfall: if `fetchResult` itself is slow (e.g., doing a real HTTP call), the goroutine can be stuck inside `fetchResult` before it even reaches the send; passing a cancellable `ctx` (CHANGE 2) lets `fetchResult` bail out early when that context is cancelled.

---

### Issue 2: Stop channel not reset between Start/Stop cycles

**Problem:** `Stop()` sends one value into `p.stop`. After that, the channel still exists but has been drained. If `Start()` is called again, the goroutine it spawns uses the same `p.stop` channel. The next call to `Stop()` will work, but any code that sends a second time or that closed the channel would panic or misbehave. More concretely, the `cancel` func from the first `Start()` is overwritten without ever being called, leaking the context.

**Fix:** At the top of `Start()`, recreate `p.stop` with `make(chan struct{})` and call `context.WithCancel` to get a fresh `ctx` and `cancel` stored in `p.cancel`. In `Stop()`, call `p.cancel()` before sending to `p.stop` so any in-flight `fetchResult` that respects the context can exit early.

**Explanation:** A send-based stop channel (as opposed to `close`) is single-use: one send unblocks exactly one goroutine. If `Start()` is called a second time without resetting the channel, both the new goroutine and the old state share the same channel object, which is fine for a single cycle but fragile across multiple cycles. Calling `p.cancel()` in `Stop()` before signalling `p.stop` means that if `fetchResult` is mid-flight and honours context cancellation (e.g., via `http.NewRequestWithContext`), it returns immediately rather than making the caller wait for the full network timeout before the stop signal is ever received.
