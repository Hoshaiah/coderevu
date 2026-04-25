## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Pipeline Stage Deadlocks
// ------------------------------------------------------------------------

package pipeline

func Transform(in, out chan string, fn func(string) string) {
	go func() {
		for v := range in {
			out <- fn(v)
		}
		// CHANGE 1: close(in) removed — Transform does not own the input channel; closing a channel you don't own causes a panic or signals producers prematurely.
		// CHANGE 2: close(out) added — Transform owns the output channel and must close it so downstream consumers can detect end-of-stream and unblock.
		close(out)
	}()
}
```

## Explanation

### Issue 1: Closing a channel you don't own

**Problem:** `Transform` calls `close(in)` on the channel passed in from the caller. The upstream producer still holds a reference to `in` and may still be sending on it. When the producer sends to a closed channel, Go panics with `send on closed channel`. Even if the producer has finished, closing `in` here is a semantic violation: the owner of a channel is responsible for closing it, and `Transform` is a consumer of `in`, not its producer.

**Fix:** Remove the `close(in)` call entirely (CHANGE 1). `Transform` should only consume from `in`; whoever created and writes to `in` is responsible for closing it.

**Explanation:** In Go, closing a channel is a one-way signal from producer to consumer meaning "no more values". If a non-owner closes the channel, the real owner's next `send` panics. Beyond the panic risk, the `range in` loop already terminates correctly when the upstream owner closes `in`, so the extra `close(in)` is both redundant and dangerous. A related pitfall: if two goroutines both try to close the same channel, that also panics — another reason to enforce single-owner closing.

---

### Issue 2: Output channel never closed, downstream blocks forever

**Problem:** After processing all values from `in`, the goroutine exits without closing `out`. Any downstream stage that does `for v := range out` or a plain receive on `out` blocks indefinitely waiting for more data that will never arrive. This is the deadlock visible in the `SIGQUIT` stack trace.

**Fix:** Add `close(out)` after the `for v := range in` loop, inside the goroutine, before it returns (CHANGE 2). This signals to downstream consumers that no more values will be sent.

**Explanation:** A `range` over a channel only terminates when the channel is closed. If `Transform` drains `in` and exits its goroutine without closing `out`, the downstream consumer's `range out` loop never sees the end-of-stream signal and parks on the channel receive forever. The goroutine that writes to `out` is the owner of `out` from the pipeline's perspective, so it is the correct place to call `close(out)`. Closing inside the goroutine (not after the `go` statement) is important because `Transform` itself returns immediately — if you tried to `close(out)` outside the goroutine, it would race with the goroutine's sends.
