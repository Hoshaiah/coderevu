## Reference solution

```ruby
# ------------------------------------------------------------------------
# ANSWER — File handles leak when an exception is raised during processing
# ------------------------------------------------------------------------
class CsvLoader
  def load_file(path)
    # CHANGE 1: Use File.open with a block so Ruby closes the handle automatically, even if an exception is raised inside the block. Removes the explicit file.close.
    File.open(path) do |file|
      rows = []

      file.each_line do |line|
        rows << parse_line(line)
      end

      import_rows(rows)
    end # CHANGE 1: block end — file is closed here regardless of how we exit
  rescue CSV::MalformedCSVError => e
    # CHANGE 2: rescue is now outside the File.open block, so the file is already closed before we reach this handler, covering all exit paths.
    Rails.logger.warn("Skipping malformed file #{path}: #{e.message}")
  end

  private

  def parse_line(line)
    CSV.parse_line(line)
  end
end
```

## Explanation

### Issue 1: File handle leaked on exception

**Problem:** When `CSV::MalformedCSVError` is raised inside `file.each_line`, execution jumps directly to the `rescue` block, bypassing `file.close`. The file descriptor is never returned to the OS. After enough malformed files are processed, the worker process exhausts its file descriptor limit and starts failing with `Errno::EMFILE: Too many open files`.

**Fix:** Replace the explicit `File.open(path)` assignment with `File.open(path) do |file| … end` (a block form). Remove the manual `file.close` call. The `rescue` clause moves outside the block.

**Explanation:** Ruby's `File.open` with a block wraps the body in an implicit `ensure` that calls `close` on the file object when the block exits, whether that exit is normal, via `return`, or via an unhandled exception. The original code relied on reaching `file.close` on the happy path, but `rescue` intercepts the exception before that line runs. The block form closes the handle before the rescued exception propagates outward, so `rescue` always sees an already-closed file. A related pitfall: if you add a second `rescue` for another error type, the block form keeps protecting you without any extra `ensure` boilerplate.

---

### Issue 2: Rescue scope too narrow to protect against all exit paths

**Problem:** The original code only rescues `CSV::MalformedCSVError`. Any other exception raised inside the method — say, a network error in `import_rows`, a `TypeError` from a bad encoding, or an `Errno::EACCES` on the file itself — propagates up uncaught. In the original code, that also skips `file.close` because the uncaught exception bypasses it just as the rescued one does.

**Fix:** By moving `rescue` outside the `File.open` block (CHANGE 2 site), the file is closed by the block's implicit `ensure` before any exception reaches the `rescue` or propagates further. No change to which exceptions are rescued is needed; the structural fix handles all exit paths.

**Explanation:** The root cause is that `rescue` in the original method acts as the only cleanup gate, but it only fires for one exception class. The block-based `File.open` separates concerns: cleanup is handled by Ruby's block guarantee, and the `rescue` clause is free to handle only the error types it actually intends to handle. Even if a completely unexpected exception escapes the `rescue`, the file is still closed because the block's `ensure` runs first. This makes the cleanup unconditional and independent of what exception types the caller decides to handle.
