## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Select Blocks on Nil Channel
// ------------------------------------------------------------------------

package stream

func Merge(a, b <-chan int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		// CHANGE 1: Initialize aOpen/bOpen based on whether the channel is nil; a nil channel must never enter the select and must be treated as already closed.
		aOpen, bOpen := a != nil, b != nil
		for aOpen || bOpen {
			// CHANGE 1: Replace bare select with a nil-channel-safe dispatch: set local variables to nil when the stream is closed/absent so those cases are permanently disabled.
			var ac, bc <-chan int
			if aOpen {
				ac = a
			}
			if bOpen {
				bc = b
			}
			select {
			// CHANGE 2: Use ac instead of a so that when aOpen is false the case is on a nil channel and is never selected, preventing the goroutine from stalling.
			case v, ok := <-ac:
				if !ok {
					aOpen = false
					continue
				}
				out <- v
			// CHANGE 2: Use bc instead of b for the same reason — a nil bc disables this case entirely.
			case v, ok := <-bc:
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

## Explanation

### Issue 1: nil channel initialization never closes stream

**Problem:** When `a` or `b` is `nil`, the corresponding `aOpen`/`bOpen` flag starts as `true` even though there is no producer. The loop condition `aOpen || bOpen` therefore never becomes false after the real channel closes, so the goroutine runs (or stalls) forever and `out` is never closed.

**Fix:** At the top of the goroutine, initialize `aOpen` and `bOpen` with `a != nil` and `b != nil` respectively (the `// CHANGE 1` lines). A nil argument is treated as already-closed from the start.

**Explanation:** The old code unconditionally set both flags to `true`. After the one live channel closes and its flag flips to `false`, the other flag remains `true` because it was never set to `false` — the nil channel never produces a close event. The loop therefore spins (or blocks) indefinitely. Setting the flag to `false` when the channel is nil means the loop exits as soon as the live channel closes, mirroring the semantics of a channel that was closed before `Merge` was called.

---

### Issue 2: select on nil channel blocks the goroutine permanently

**Problem:** In Go, receiving from a nil channel blocks forever. When `a` is `nil`, the `case v, ok := <-a` arm is always eligible to block but never ready, so the `select` stalls on it whenever the scheduler picks that case — or worse, the select with two blocking cases (nil channel + no data on the live channel yet) blocks until the live channel has data, interleaving correctly for a while but then hanging after the live channel closes because `aOpen` is still `true` and `ac` is still `a` (nil).

**Fix:** Inside the loop, introduce local variables `ac` and `bc` that are set to the real channel only when the corresponding `Open` flag is `true`, and to `nil` otherwise. The `select` cases use `ac` and `bc` instead of `a` and `b` (the `// CHANGE 2` lines). A nil channel in a select case is permanently ignored by the runtime.

**Explanation:** Go's `select` statement treats a receive on a nil channel as a case that can never proceed, so it is excluded from the set of ready cases. By copying `a` into `ac` only while `aOpen` is `true`, we guarantee that once a stream is done (or was never present) its select case is effectively removed. Without this, even with the flag fix from Issue 1, the very first iteration of the loop with a nil `a` would block inside the select — both `<-a` (nil, blocks forever) and `<-b` (waiting for data) are the only cases, and the select would hang after `b` closes because `<-a` can never complete.
