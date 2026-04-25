## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Request counter is under-counted under concurrent load
# ------------------------------------------------------------------------
class RequestCounter
  # CHANGE 2: Replace bare @@count with an instance variable on the class and introduce a dedicated Mutex constant so state is fully encapsulated and not shared with subclasses.
  @count = 0
  LOCK = Mutex.new

  def self.increment
    # CHANGE 1: Wrap the read-modify-write inside a Mutex#synchronize so only one thread at a time executes the += 1, eliminating the lost-update race condition.
    LOCK.synchronize { @count += 1 }
  end

  def self.value
    # CHANGE 1: Also synchronize the read so the caller sees a consistent value and is not subject to CPU cache / memory-visibility issues.
    LOCK.synchronize { @count }
  end
end

# Called from Rack middleware on every request:
def call(env)
  RequestCounter.increment
  @app.call(env)
end
```

## Explanation

### Issue 1: Non-atomic increment drops counts under concurrency

**Problem:** Under concurrent load the counter ends up lower than the real request count. With dozens of Puma threads all calling `RequestCounter.increment` simultaneously, some increments silently disappear.

**Fix:** Wrap `@count += 1` in `LOCK.synchronize { ... }` in both `self.increment` and `self.value`, where `LOCK` is `Mutex.new` stored as a constant.

**Explanation:** `@@count += 1` compiles to three steps: read `@@count`, add 1, write back. Two threads can read the same value (say, 100), each add 1, and both write 101 — so two requests produce only one increment. This is a classic read-modify-write race. MRI Ruby's GIL does not protect you here because the GIL can yield between the read and the write, and Puma can run on JRuby or TruffleRuby where there is no GIL at all. `Mutex#synchronize` ensures only one thread executes the critical section at a time, so every increment is counted. The read in `self.value` is also synchronized to prevent a thread from observing a partially-written integer on non-MRI runtimes.

---

### Issue 2: Class variable `@@count` leaks across subclasses

**Problem:** Ruby class variables (`@@`) are shared with every subclass. If any subclass of `RequestCounter` exists anywhere in the application — even in a gem — it reads and writes the same `@@count`, producing unpredictable corruption of the counter value.

**Fix:** Replace `@@count = 0` with `@count = 0` (a class-level instance variable) so the state belongs only to `RequestCounter` itself and is invisible to subclasses.

**Explanation:** In Ruby, `@@foo` walks up the entire inheritance chain; any subclass or sibling that also defines `@@count` clobbers the same slot. A class-level instance variable `@count`, defined directly on the class object `RequestCounter`, is only accessible via `RequestCounter` itself — subclasses each get their own independent `@count` if they define one. This is the standard Ruby idiom for per-class state that should not bleed across inheritance. The `Mutex` is stored in a constant (`LOCK`) rather than another `@@` or `@` variable so it is created exactly once at load time and never accidentally reset.
