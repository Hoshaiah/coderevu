## Reference solution

```go
// ------------------------------------------------------------------------
// ANSWER — Close on Nil Channel Panics
// ------------------------------------------------------------------------

package pipeline

import "sync"

func Fanout(input <-chan int, n int, process func(int)) {
	var wg sync.WaitGroup

	if n > 0 {
		// CHANGE 1: Allocate done inside the n>0 block AND defer close before Wait so workers can be signalled; avoids closing a nil channel when n=0.
		done := make(chan struct{})
		defer close(done)
		wg.Add(n)
		for i := 0; i < n; i++ {
			go func() {
				defer wg.Done()
				for {
					select {
					case v, ok := <-input:
						if !ok {
							return
						}
						process(v)
					case <-done:
						return
					}
				}
			}()
		}
	}

	// CHANGE 2: Removed the bare `close(done)` call here; done is now a local in the n>0 block and is closed via defer, so this line would not compile and was the source of the nil-channel panic.
	wg.Wait()
}
```

## Explanation

### Issue 1: Closing nil channel when n=0

**Problem:** When `n` is 0, the `if n > 0` block is skipped, so `done` stays `nil`. The code then calls `close(done)` unconditionally after `wg.Wait()`. Closing a `nil` channel is a runtime panic in Go, which is exactly the crash the team sees.

**Fix:** Move the `done` channel declaration inside the `if n > 0` block so it becomes a block-scoped variable. Add `defer close(done)` immediately after `make(chan struct{})`. Remove the bare `close(done)` at the bottom of the function.

**Explanation:** In Go, `var done chan struct{}` gives you a `nil` channel. Reading from a `nil` channel blocks forever; closing one panics immediately. Because the variable was declared at function scope but only assigned inside the conditional, the assignment was skipped when `n=0`, leaving `done` as `nil` when `close(done)` ran. Moving the declaration and `make` call into the same branch that uses it guarantees the channel is never `nil` when closed. The `defer` ensures the channel is closed after the deferred function scope exits (i.e., after `wg.Wait()` returns), preserving the original intent of signalling workers to stop.

---

### Issue 2: Closing done after workers have already finished

**Problem:** The original code calls `wg.Wait()` first, which blocks until all workers exit. By the time `close(done)` runs, there are no goroutines left listening on `done`. The channel close is therefore a no-op at best, and a nil-channel panic at worst.

**Fix:** Replace the post-`wg.Wait()` `close(done)` with `defer close(done)` placed immediately after `done` is created, before `wg.Wait()` is called. This way `done` closes when the function returns, which happens after `wg.Wait()` completes — but the deferred close is registered early enough to be valid in either the normal or early-return paths.

**Explanation:** `defer` statements execute in LIFO order when the surrounding function returns, after any explicit `return` or fall-through. Registering `defer close(done)` right after `make` means Go will close the channel at function exit regardless of how the function exits. Workers that are still running when `input` is drained but haven't yet noticed can be unblocked via the `done` case in their `select`. If workers exit first (because `input` closed), the deferred `close` is harmless — receiving from a closed channel returns immediately, and there are no receivers left anyway. The key pitfall avoided here is the original ordering: `wg.Wait()` → `close(done)` could never signal workers because `Wait` only returns after all workers are gone.
