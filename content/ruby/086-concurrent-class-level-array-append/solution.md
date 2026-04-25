## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Shared Class Array in Workers
# ------------------------------------------------------------------------

module Pipeline
  class EventCollector
    # CHANGE 3: Replace mutable constant Array with a Mutex and an instance variable so the buffer is not a shared global constant object.
    LOCK = Mutex.new
    @buffer = []

    def self.collect(event)
      # CHANGE 1: Wrap the append in LOCK.synchronize so only one thread mutates the buffer at a time, preventing race conditions and silent drops.
      LOCK.synchronize { @buffer << event }
    end

    def self.flush!
      # CHANGE 2: Atomically swap the buffer with a new empty array inside the lock so no events appended during flush are lost; the old array is processed outside the lock.
      events_to_process = LOCK.synchronize { @buffer.tap { @buffer = [] } }
      BulkEventImporter.import(events_to_process)
      events_to_process.size
    end

    def self.size
      # CHANGE 1: Read size inside the lock for a consistent snapshot.
      LOCK.synchronize { @buffer.size }
    end
  end
end

# Called from 16 parallel worker threads:
# Pipeline::EventCollector.collect(event)
```

## Explanation

### Issue 1: Unsynchronized concurrent Array mutations

**Problem:** Multiple threads call `BUFFER << event` at the same time with no lock. The operator sees fewer events in the flushed batch than were received. Occasionally the process crashes with a corrupted-array or unexpected-state error.

**Fix:** Every read and write of `@buffer` is wrapped in `LOCK.synchronize { ... }` using a `Mutex` constant named `LOCK`. This includes `<<` in `collect` and `.size` in `size`.

**Explanation:** Ruby's `Array#<<` is not atomic. When two threads execute it concurrently, they both read the current internal length, compute the new index, and write to the same slot. One write overwrites the other, so one event disappears. Under MRI's GIL this is less likely to crash but still happens during GIL-release points (e.g., memory allocation). On JRuby or Ractors it crashes more reliably. Wrapping each mutation in a `Mutex` ensures only one thread modifies the array at a time. A single `Mutex` per class (not per call) is correct here; creating a new mutex on every `collect` would provide no protection at all.

---

### Issue 2: Non-atomic `dup` + `clear` in `flush!` drops events

**Problem:** `flush!` calls `BUFFER.dup` then `BUFFER.clear` as two separate operations. Any event appended by a worker thread between those two lines is in neither the dup'd snapshot nor the cleared array — it is lost permanently.

**Fix:** Replace `dup` + `clear` with an atomic swap inside `LOCK.synchronize`: `@buffer.tap { @buffer = [] }`. This captures the old array and installs a fresh one in a single critical section, then runs `BulkEventImporter.import` outside the lock.

**Explanation:** `Array#dup` takes a snapshot and `Array#clear` empties the original, but the gap between those two lines is a real window. A thread calling `collect` between `dup` and `clear` appends to the original array; `clear` then discards that append. The swap pattern works because after the lock is released the old array object is referenced only by `events_to_process` (the worker threads now write to the new `@buffer`), so the import runs safely without holding the lock and without any window for loss.

---

### Issue 3: Mutable state stored in a constant

**Problem:** `BUFFER = []` assigns a mutable `Array` to a Ruby constant. Constants in Ruby are not immutable — the object can be freely mutated by any code, and the name signals stability to readers when the value is anything but stable under concurrent access.

**Fix:** Remove `BUFFER = []` and replace it with a class instance variable `@buffer = []`. The `Mutex` is kept as a true constant (`LOCK = Mutex.new`) because the mutex object itself is never mutated — only its internal lock state changes.

**Explanation:** Ruby constants allow the reference to be reassigned (with a warning) and never restrict mutation of the pointed-to object. Naming a shared mutable array `BUFFER` misleads readers into thinking it is safe to reference directly, and it makes it easy to accidentally bypass the mutex by writing `BUFFER << event` instead of going through `collect`. A class instance variable `@buffer` is private by convention to the class methods, making unsynchronized access harder to do accidentally. The mutex itself is fine as a constant because `Mutex#synchronize` does not mutate the mutex object in a way that creates a race.
