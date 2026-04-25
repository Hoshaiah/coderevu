## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Pipeline Drops Items on Slow Consumer
// ------------------------------------------------------------------------

package metrics

import (
	"context"
	"log"
	"time"
)

type Event struct {
	Name  string
	Value float64
}

func StartPipeline(ctx context.Context, flush func([]Event)) chan<- Event {
	// CHANGE 1: Buffer raised from 256 to 8192 (50k events/sec * 0.1s flush interval = 5000 events minimum; 8192 gives headroom for bursts).
	ch := make(chan Event, 8192)

	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		var batch []Event

		for {
			select {
			case <-ctx.Done():
				// CHANGE 2: Drain remaining queued events before flushing on shutdown so in-flight items are not lost when context is cancelled.
				for {
					select {
					case e := <-ch:
						batch = append(batch, e)
					default:
						goto done
					}
				}
				done:
				if len(batch) > 0 {
					flush(batch)
				}
				return
			case <-ticker.C:
				// CHANGE 2: Drain the entire channel contents into the batch on each tick instead of relying on select to round-robin, so a burst of queued events is never left sitting while the ticker fires repeatedly.
				for {
					select {
					case e := <-ch:
						batch = append(batch, e)
					default:
						goto flush
					}
				}
				flush:
				if len(batch) > 0 {
					flush(batch)
					batch = nil
				}
			case e := <-ch:
				batch = append(batch, e)
			}
		}
	}()

	return ch
}

func Emit(ch chan<- Event, e Event) {
	select {
	case ch <- e:
	default:
		log.Printf("dropping event %s: channel full", e.Name)
	}
}
```

## Explanation

### Issue 1: Channel buffer too small for event rate

**Problem:** At 50,000 events/sec with a 100ms flush interval, up to 5,000 events can arrive between flushes. The channel buffer is only 256 slots. Once it fills — which happens in about 5ms — every subsequent call to `Emit` hits the `default` branch and silently discards the event. No error is surfaced to the caller, and the only signal is a `log.Printf` that apparently goes unnoticed.

**Fix:** `make(chan Event, 8192)` replaces `make(chan Event, 256)` at the `CHANGE 1` site, giving a buffer large enough to absorb a full flush interval's worth of events plus burst headroom.

**Explanation:** The buffer needs to hold at least `rate × flush_interval` events without blocking. At 50k/sec and 100ms that is 5,000 events. 256 is 20× too small, so the channel saturates almost instantly during any normal burst. Raising the buffer to 8,192 means the channel stays below capacity throughout a typical flush cycle. If the producer ever sustains a rate where even 8,192 is not enough, `Emit` will still drop and log — but that is the intended back-pressure mechanism for genuine overload, not normal operation.

---

### Issue 2: select starves channel-receive case on tick

**Problem:** Go's `select` chooses uniformly at random among all ready cases. When the ticker fires at the same time as new events are queued, the goroutine may service `<-ticker.C` without reading the channel, then loop back and service another tick, and so on. Events pile up in the buffer faster than the consumer drains them, contributing to the observed gaps even after the buffer is widened.

**Fix:** Inside the `<-ticker.C` case and the `<-ctx.Done()` case, a non-blocking inner `select` loop drains the entire channel into `batch` before calling `flush`. This is the `CHANGE 2` sites. The outer `case e := <-ch` still handles the between-tick ingestion path.

**Explanation:** The original code reads at most one event per `select` iteration. Between two consecutive ticks (100ms apart) the goroutine must win the `case e := <-ch` branch thousands of times in a row to keep up. Because `select` is random, the ticker case and `ctx.Done` case compete fairly each iteration and can delay channel reads. The fix changes the tick handler from "check if batch is non-empty then flush" to "drain the whole channel then flush", which guarantees that every event present at flush time is included in the batch. The inner non-blocking drain loop exits immediately when the channel is empty, so it adds no latency on the happy path.
