## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Sequence Recomputes Side Effects on Reuse
// ------------------------------------------------------------------------

import java.io.File

data class Record(val id: String, val value: String)

class RecordPipeline(private val csvFile: File) {

    private fun recordSequence(): Sequence<Record> = sequence {
        println("Reading CSV...")
        csvFile.bufferedReader().useLines { lines ->
            lines.drop(1).forEach { line ->
                val parts = line.split(",")
                yield(Record(parts[0], parts[1]))
            }
        }
    }

    fun run(db: Database, auditLog: AuditLog) {
        // CHANGE 1: Materialize the validated records into a List before iterating. A Sequence re-runs its entire producer lambda from scratch on every terminal operation, so calling forEach twice on `validated` would read and parse the CSV file twice; a List is computed once and iterated as many times as needed.
        val validated: List<Record> = recordSequence().filter { it.value.isNotBlank() }.toList()

        // CHANGE 2: Iterate the materialized list once per destination; both destinations now see exactly the same set of records from a single file read, eliminating duplicates and divergence.
        validated.forEach { db.insert(it) }

        validated.forEach { auditLog.append(it) }
    }
}

interface Database { fun insert(r: Record) }
interface AuditLog { fun append(r: Record) }
```

## Explanation

### Issue 1: Sequence Recomputes Producer on Each Terminal Operation

**Problem:** Every record is written to the audit log twice and the CSV reading code runs more times than there are records. In production this means both `db.insert` and `auditLog.append` each receive every record once, but from separate full passes through the file — and the audit log ends up with every record duplicated relative to what a single-pass design would write.

**Fix:** Replace the `Sequence` terminal operations on `validated` with a single call to `.toList()` at `CHANGE 1`, storing all validated records in a `List<Record>`. The two `forEach` calls at `CHANGE 2` then iterate that in-memory list, not the sequence.

**Explanation:** A Kotlin `sequence { }` builder produces a cold sequence: it does not run any code until a terminal operator (like `forEach`, `toList`, `count`) pulls from it, and it re-runs the entire producer lambda from the very first `yield` for each such operator. The variable `validated` is itself a lazy chain — it holds a reference to `records.filter(...)`, not a computed collection. Calling `validated.forEach` twice therefore drives the sequence twice, which drives `records` twice, which calls `bufferedReader().useLines` twice and re-reads the whole file. Materializing with `toList()` collapses the lazy chain into a concrete `List` in one pass; subsequent `forEach` calls on that list are plain array iteration with no side-effect re-execution. Note: if the files truly cannot fit in memory, the correct alternative is to merge the two `forEach` bodies into a single pass — `validated.forEach { db.insert(it); auditLog.append(it) }` — rather than materializing.

---

### Issue 2: Two-Pass Design Allows Database and Audit Log to Diverge

**Problem:** If an exception is thrown partway through the second `forEach` (writing to the audit log), all records processed so far in the first `forEach` (database inserts) have no corresponding audit log entry. The database and audit log end up out of sync in a way that is hard to detect and harder to repair.

**Fix:** At `CHANGE 1`, materializing into a `List` before either write means both destinations iterate the same pre-computed collection. At `CHANGE 2`, both `forEach` calls operate on that list, so any failure after a partial second pass leaves a clear, consistent audit trail of exactly which records made it into both destinations.

**Explanation:** With the original sequence, the first `forEach` consumes the sequence to completion and inserts every valid record into the database. The sequence is then reset and the second `forEach` starts a brand-new iteration for the audit log. If the audit log writer throws on record 500 of 1000, records 1–499 are in the audit log and records 500–1000 are not, while all 1000 are already in the database. There is no transactional boundary tying the two writes together, so partial failure creates permanent divergence. Materializing first does not add a transaction, but it does ensure the two iterations walk the identical in-memory list, making the failure mode symmetric (both destinations fail at the same record index) and easier to reconcile. If atomicity is required, a single-pass `forEach` that writes to both destinations inside one loop body is a more robust design.
