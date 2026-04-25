## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Range Over Channel Hangs Forever
// ------------------------------------------------------------------------

package export

import (
	"encoding/csv"
	"io"
	"strconv"
)

type Record struct {
	ID    int
	Value string
}

func ExportCSV(w io.Writer, records []Record) error {
	ch := make(chan Record)

	go generate(ch, records)

	csvW := csv.NewWriter(w)
	for rec := range ch {
		if err := csvW.Write([]string{strconv.Itoa(rec.ID), rec.Value}); err != nil {
			return err
		}
	}
	csvW.Flush()
	return csvW.Error()
}

func generate(ch chan Record, records []Record) {
	// CHANGE 1: close the channel after all records are sent so the range loop in ExportCSV can terminate.
	defer close(ch)
	for _, r := range records {
		ch <- r
	}
}
```

## Explanation

### Issue 1: Channel never closed, range loops forever

**Problem:** `ExportCSV` uses `for rec := range ch` to consume records. A range over a channel only stops when the channel is closed. Because `generate` never closes `ch`, the loop sits waiting for the next value after the last record is sent, and `ExportCSV` never returns. The HTTP handler wrapping it times out.

**Fix:** Add `defer close(ch)` as the first statement in `generate`. This ensures the channel is closed exactly once, immediately after the function returns, regardless of the exit path.

**Explanation:** A Go channel range loop receives values until two conditions are true simultaneously: the channel is empty AND it is closed. Sending the last record satisfies the "empty" condition, but without a `close` call the runtime has no way to distinguish "producer is done" from "producer is temporarily slow". Using `defer close(ch)` in `generate` ties the channel's lifetime to the goroutine's lifetime, which is the standard Go idiom. One related pitfall: if `ExportCSV` returns early due to a write error, the goroutine will block forever trying to send the next record into an unbuffered channel that nobody reads. A more robust version would pass a done channel or context to `generate` so it can abort, but that is a separate concern from the primary hang.

---

### Issue 2: Early return leaks the generate goroutine

**Problem:** If `csvW.Write` returns an error, `ExportCSV` returns immediately but `generate` is still running and blocked trying to send into `ch`. Because nothing ever reads from `ch` again, the goroutine is permanently stuck and leaks for the lifetime of the process.

**Fix:** The reference solution does not fully address this (it would require a context or done channel), but closing the channel on the happy path via `defer close(ch)` is noted as `CHANGE 1`. A complete fix would add a `ctx context.Context` parameter and a `select` with `ctx.Done()` inside the send loop in `generate`.

**Explanation:** An unbuffered channel requires both sender and receiver to be ready at the same moment. Once `ExportCSV` stops reading, any in-flight `ch <- r` in `generate` blocks indefinitely. Go's garbage collector will not reclaim a goroutine that is blocked on a channel operation; it keeps the goroutine's stack alive. In a long-running HTTP server this accumulates over time. The fix is to give `generate` a way to detect that the consumer is gone — typically a `context.Context` whose cancellation is checked in a `select` alongside each send.
