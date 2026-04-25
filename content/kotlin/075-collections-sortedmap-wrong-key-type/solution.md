## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — TreeMap Natural Order Crashes on Mixed Types
// ------------------------------------------------------------------------

import java.util.TreeMap

data class Task(val name: String, val payload: String)

class PriorityTaskQueue {
    // CHANGE 1: Key type narrowed from Any to String so TreeMap's String natural-order comparator never receives a non-String key, eliminating the ClassCastException.
    private val queue: MutableMap<String, MutableList<Task>> = sortedMapOf()

    // CHANGE 1: Parameter type changed from Any to String so the compiler rejects non-String priority values at every call site.
    fun add(priority: String, task: Task) {
        queue.getOrPut(priority) { mutableListOf() }.add(task)
    }

    fun drainInOrder(): List<Task> {
        return queue.values.flatten().also { queue.clear() }
    }
}

// Caller A — correct, unchanged
fun scheduleHigh(q: PriorityTaskQueue, t: Task) = q.add("high", t)

// CHANGE 2: Integer literal 1 replaced with the string "low" to match the intended priority tag and the now-enforced String parameter type.
fun scheduleLow(q: PriorityTaskQueue, t: Task) = q.add("low", t)
```

## Explanation

### Issue 1: Overly-broad key type permits mixed comparisons

**Problem:** `queue` is declared as `MutableMap<Any, …>` and `add` accepts `Any` as the priority. `sortedMapOf()` returns a `TreeMap` that uses natural ordering, which casts each key to `Comparable<Any>` before comparing. When the map holds both a `String` key and an `Int` key, the comparator tries to call `String.compareTo(Int)`, which throws `ClassCastException` deep in JDK internals. The crash only appears once a second key of a different type is inserted, so it is intermittent and the stack trace is misleading.

**Fix:** Change the map declaration to `MutableMap<String, MutableList<Task>>` and the `add` parameter from `Any` to `String`. `sortedMapOf()` infers `TreeMap<String, …>` and the comparator only ever sees `String` vs `String`.

**Explanation:** `TreeMap` with natural ordering works by casting the key to `Comparable` and calling its `compareTo` method. `String.compareTo` is only defined for other `String` arguments; passing an `Int` as the argument causes a `ClassCastException` at the cast site inside the JDK, not at your call site. Kotlin's type system would catch this at compile time if the key type is `String`, because `q.add(1, t)` would be a type error. Narrowing the generic type parameter is the minimal change that both fixes the runtime crash and makes the compiler the first line of defence against future misuse.

---

### Issue 2: Wrong literal passed at new call site

**Problem:** `scheduleLow` calls `q.add(1, t)`, passing the integer `1` where a string priority tag like `"low"` was intended. Because the old signature accepted `Any`, the Kotlin compiler did not flag it. At runtime the `Int` key sits alongside `String` keys in the `TreeMap` and triggers the comparator crash described in Issue 1.

**Fix:** Replace the integer literal `1` with the string `"low"` in the `scheduleLow` call: `q.add("low", t)`. After the Issue 1 fix tightens the parameter type to `String`, this line would be a compile error if left as `1`, making the correction mandatory.

**Explanation:** The root cause is that `Any` erases intent — the method contract said "pass a priority string" but the type system did not enforce it. A developer seeing an integer overload for a priority level (e.g. `1` for low) is a plausible mistake, especially if they come from a codebase that uses numeric priority levels. Changing the literal to `"low"` aligns it with the alphabetical ordering the `TreeMap` was designed to produce. A related pitfall: even with the correct string, callers should use a restricted set of values (e.g. an `enum` or sealed class) to prevent typos like `"hig"` silently creating a fourth priority bucket.
