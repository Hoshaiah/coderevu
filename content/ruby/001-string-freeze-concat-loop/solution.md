## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — Frozen String Concat in Loop
# ------------------------------------------------------------------------

# frozen_string_literal: true

module ReportBuilder
  def self.build_csv(rows, separator: ",")
    # CHANGE 1: Use String.new instead of a string literal so the object is mutable even under frozen_string_literal: true
    output = String.new

    rows.each_with_index do |row, idx|
      line = row.join(separator)
      output << line
      # CHANGE 2: Always append a newline after every row (including the last) to produce standard newline-terminated CSV output
      output << "\n"
    end

    output
  end
end
```

## Explanation

### Issue 1: Frozen String Literal Prevents Mutation

**Problem:** When `# frozen_string_literal: true` is at the top of the file, every string literal in that file is frozen at parse time. The line `output = ""` creates a frozen `String` object. The first `output << line` inside the loop tries to mutate that frozen object and raises `FrozenError: can't modify frozen String`, crashing the ETL job partway through any file that carries the magic comment.

**Fix:** Replace `output = ""` with `output = String.new` (the `CHANGE 1` line). `String.new` always allocates a fresh, mutable `String` regardless of the `frozen_string_literal` setting.

**Explanation:** The `frozen_string_literal: true` magic comment is a performance hint that tells Ruby to intern and freeze every string literal in the file so identical literals share one object. That works fine for strings you only read, but `output` is written to with `<<` on every iteration. `String.new` bypasses the freeze because it is a method call that allocates at runtime, not a literal. A related pitfall: `String.new("")` also works and makes the intent clearer, but the argument `""` itself is frozen — only the returned new object is mutable. `dup` on a frozen literal (`"".dup`) is another common workaround, but `String.new` is the idiomatic choice for building a mutable buffer.

---

### Issue 2: Missing Trailing Newline on Last Row

**Problem:** The original code uses `unless idx == rows.size - 1` to skip the newline after the final row. Standard CSV and most line-oriented formats expect every record to end with a newline, including the last one. Downstream parsers and tools like `wc -l` will miscount rows or fail to parse the final record when the trailing newline is absent.

**Fix:** Remove the `unless` condition at the `CHANGE 2` site so `output << "\n"` executes unconditionally after every row, including the last.

**Explanation:** The intent was probably to avoid a trailing blank line, but a newline after the last record is not a blank line — it is the line terminator for that record. POSIX defines a text file as a sequence of lines each ending with `\n`, and RFC 4180 (CSV) recommends the same. The conditional also adds an `Array#size` call on every iteration just to check whether this is the last row, which is unnecessary overhead for 500k-row datasets. Removing the condition simplifies the code and produces output that round-trips correctly through standard CSV readers.
