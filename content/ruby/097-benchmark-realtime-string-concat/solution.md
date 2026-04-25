## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — String Concat in Tight Loop
# ------------------------------------------------------------------------

module Report
  class CsvBuilder
    HEADER = "id,amount,currency,created_at\n"

    def self.build(transactions)
      # CHANGE 1: Use a mutable array and join instead of += string concat in loop; avoids O(n²) string copying and O(n) throwaway String allocations.
      rows = [HEADER]
      transactions.each do |txn|
        rows << "#{txn.id},#{txn.amount},#{txn.currency},#{txn.created_at}\n"
      end
      # CHANGE 2: Join accumulates all rows into one String in a single linear pass, keeping peak memory proportional to data size, not iteration count.
      rows.join
    end
  end
end
```

## Explanation

### Issue 1: String `+=` Causes Quadratic Copying

**Problem:** The Rake task times out and the process is killed after allocating gigabytes of objects. DataDog shows 40+ minutes just in the export step, even though the logic is correct.

**Fix:** Replace the `csv += ...` accumulation pattern with an Array (`rows`) that collects strings via `<<`, then call `rows.join` once at the end. The `+=` line and the final `csv` return are replaced by `rows = [HEADER]`, `rows << ...`, and `rows.join`.

**Explanation:** In Ruby, `String#+` (and therefore `+=`) always allocates a brand-new String object containing a full copy of both operands. After 500,000 iterations, each step copies the entire accumulated string so far — row 1 copies 1 row, row 2 copies 2 rows, and so on. The total bytes copied grows as the triangular number `n*(n+1)/2`, which is O(n²). For 500,000 rows this means roughly 125 billion character-copies, plus 500,000 discarded intermediate String objects for the garbage collector to reclaim. Collecting into an Array with `<<` is O(1) per append because it just stores a reference. `Array#join` then does a single linear scan to build the final string, so total work is O(n). A related pitfall: `String#<<` (shovel operator on the string itself) would also work and avoids the allocation per iteration, but the array approach makes the intent clearer and avoids accidentally mutating `HEADER` if someone forgets to duplicate it first.

---

### Issue 2: Entire Dataset Held in Memory at Once

**Problem:** Even after fixing the concatenation, the method builds one monolithic String containing all 500,000 rows before returning it. On very large exports this means the full CSV must live in RAM simultaneously alongside the ActiveRecord result set, doubling peak memory usage.

**Fix:** The `rows.join` call at the end of `build` is retained but is the natural point where a future streaming refactor would yield chunks instead. As written, the fix already reduces intermediate allocations drastically; `rows.join` produces the final string in one shot rather than accumulating it incrementally.

**Explanation:** With the array approach, Ruby allocates one small String per row and stores a reference in `rows`. The total live memory at peak is proportional to the sum of all row string lengths — unavoidable for any in-memory approach — but there are no extra copies. The discarded intermediate strings from `+=` are gone, so the garbage collector sees a flat allocation profile instead of a sawtooth one. A true streaming fix would pass a block or an `Enumerator` to the S3 multipart upload API and `yield` each row string without ever holding the full CSV, but that requires changes to the S3 upload layer and is out of scope for this method alone.
