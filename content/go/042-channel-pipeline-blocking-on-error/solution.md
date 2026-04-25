## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Error Path Blocks Pipeline Stage
// ------------------------------------------------------------------------

package stream

import "fmt"

// CHANGE 1: Accept a done channel so the producer can detect early exit and stop sending, preventing the deadlock.
func produce(in chan<- int, count int, done <-chan struct{}) {
	for i := 0; i < count; i++ {
		select {
		case in <- i:
		// CHANGE 1: If done is closed, stop producing immediately so the goroutine is not stuck on `in <- i`.
		case <-done:
			return
		}
	}
	close(in)
}

func Transform(count int) ([]int, error) {
	in := make(chan int, 8)
	out := make(chan int, 8)
	// CHANGE 1: Create a done channel that Transform closes when it wants the producer to stop.
	done := make(chan struct{})

	go produce(in, count, done)

	// CHANGE 2: Use a separate errCh to communicate the error out of the goroutine instead of a magic sentinel value.
	errCh := make(chan error, 1)
	go func() {
		defer close(out)
		for v := range in {
			// CHANGE 2: Detect the error condition and send it on errCh rather than closing out and returning silently.
			if v == 5 {
				errCh <- fmt.Errorf("transform incomplete: got %d, want %d", v, count)
				return
			}
			out <- v * v
		}
		close(errCh)
	}()

	var results []int
	for v := range out {
		results = append(results, v)
	}
	// CHANGE 1: Close done after draining out so the producer goroutine unblocks if it is still sending.
	close(done)

	// CHANGE 2: Read the error (if any) from errCh rather than inferring it from result length.
	if err, ok := <-errCh; ok && err != nil {
		return results, err
	}
	return results, nil
}
```

## Explanation

### Issue 1: Producer goroutine deadlocks on abandoned channel

**Problem:** When the transform goroutine encounters the `v == 5` condition, it closes `out` and returns without draining `in`. The producer goroutine is still trying to send values on `in`, but there is no receiver, so it blocks forever on `in <- i`. Even increasing the buffer only delays the hang until the buffer fills.

**Fix:** A `done` channel is added and passed to `produce`. Inside `produce`, every send on `in` is wrapped in a `select` with a `case <-done` arm. After `Transform` finishes consuming `out`, it calls `close(done)`, which unblocks the producer immediately regardless of how many items remain.

**Explanation:** The root cause is that a goroutine sending on a channel has no way to know its receiver has quit unless it is told explicitly. A `done` channel is the idiomatic Go solution: the sender watches both the data channel and `done` simultaneously via `select`. When `close(done)` is called, all `case <-done` arms in any goroutine watching that channel become immediately selectable. Closing `done` after the `out` loop (not inside the transform goroutine) is deliberate — at that point we know `out` is drained and no more values are wanted, so stopping the producer is safe. A related pitfall: if you close `done` inside the transform goroutine before the `out` loop finishes, the producer may stop before all already-buffered values reach the consumer, which can cause incorrect results.

---

### Issue 2: Error signaled via magic sentinel causes silent data loss

**Problem:** The transform goroutine detects errors by checking `v == 5` and then closes `out` early. This means the caller's `for v := range out` loop exits normally, giving no indication that processing was cut short. The final length check is a workaround that also triggers when `count` is legitimately small, and the actual error value is never surfaced to the caller.

**Fix:** A buffered `errCh chan error` (capacity 1) is introduced. When the error condition fires, the goroutine sends the descriptive error on `errCh` and returns. If processing completes normally, the goroutine calls `close(errCh)`. After the `out` loop, `Transform` reads from `errCh` with `if err, ok := <-errCh; ok && err != nil` to determine whether an error occurred.

**Explanation:** Using a side channel for errors is the standard Go pattern when a goroutine needs to report a failure to its caller asynchronously. A buffer of 1 ensures the goroutine can send without blocking even if `Transform` has not yet reached the `<-errCh` read. `close(errCh)` on the success path makes the receive return `ok == false`, cleanly distinguishing "no error" from "error". The old sentinel approach was fragile: if the error condition ever changed from `v == 5` to something else, the length comparison at the end might give a false positive or miss the failure entirely. Keeping error reporting on a dedicated channel also makes it straightforward to add multiple error conditions later without touching the result collection logic.
