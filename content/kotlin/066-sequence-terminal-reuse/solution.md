## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Consumed Sequence Used Twice
// ------------------------------------------------------------------------

import java.io.File

data class Record(val id: String, val value: Double, val valid: Boolean)

class RecordPipeline {

    fun process(csvFile: File): Pair<Int, List<String>> {
        // CHANGE 1: Materialize the filtered sequence into a List immediately so that both `count()` and `map().toList()` operate on the same in-memory data rather than two separate (and independent) traversals of a one-shot Sequence backed by a BufferedReader.
        val records: List<Record> = csvFile
            .bufferedReader()
            .lineSequence()
            .drop(1) // skip header
            .map { line ->
                val parts = line.split(",")
                Record(parts[0], parts[1].toDouble(), parts[2].toBooleanStrict())
            }
            .filter { it.valid }
            .toList() // CHANGE 1: terminal operation that eagerly collects all valid records once

        val count = records.count()
        val summaries = records.map { "${it.id}: ${it.value}" }.toList()

        return Pair(count, summaries)
    }
}
```

## Explanation

### Issue 1: Sequence Exhausted on First Terminal Operation

**Problem:** `records.count()` fully iterates the `Sequence`, consuming every element the underlying `BufferedReader` will ever produce. When `records.map { ... }.toList()` runs immediately after, the reader is at EOF and the sequence yields nothing, so `summaries` is always an empty list even though the file has data.

**Fix:** Insert `.toList()` at the end of the pipeline construction (the `CHANGE 1` site) before `count` or `summaries` are computed. This changes `records` from a `Sequence<Record>` to a `List<Record>`, which is an in-memory collection that can be iterated any number of times.

**Explanation:** A Kotlin `Sequence` built on `lineSequence()` is a one-shot, lazy pull-based stream tied directly to the `BufferedReader`. The reader advances its internal position as elements are consumed; it does not reset. Calling `count()` pulls every element through the pipeline to the end of the stream. On the next call, the reader position is already at EOF, so iterating the same `Sequence` reference again immediately terminates and produces zero elements. Materializing to a `List` with `.toList()` eagerly reads and stores all matching `Record` objects in heap memory once; subsequent operations on a `List` just traverse an array, and they work correctly every time. The trade-off is memory: for very large files you would need a different approach (e.g., a single pass that accumulates both the count and the summaries), but for the stated use case this is the correct minimal fix.

---

### Issue 2: BufferedReader Underlying Stream Not Rewindable

**Problem:** Even if the developer tried to call `records.count()` and then re-create the same sequence expression, the `BufferedReader` constructed inline in the chain would need to be reopened — a `BufferedReader` over a file cannot seek backwards. This means any pattern that tries to traverse the same `Sequence` twice (or reconstruct it without reopening the file) will silently produce empty or partial results on the second pass.

**Fix:** The `.toList()` addition at `CHANGE 1` resolves this as well: the file is opened and read exactly once during the single `.toList()` call, so the `BufferedReader` lifecycle is fully contained inside that one traversal and the reader is closed when the `use`-equivalent scope ends.

**Explanation:** `File.bufferedReader()` opens the file at position 0 and returns a `BufferedReader` wrapping a `FileInputStream`. There is no implicit rewind. Once the stream reaches EOF, subsequent `read()` calls return -1 and the `lineSequence()` iterator signals completion immediately. Materializing the sequence into a `List` right after construction decouples the rest of the logic from the stream entirely: `count` and `summaries` both operate on a plain `ArrayList` in memory, which has no EOF concept and supports arbitrary re-iteration.
