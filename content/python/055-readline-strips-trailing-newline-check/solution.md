## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — EOF Detection on Stripped Lines
# ------------------------------------------------------------------------

def read_new_lines(path: str, last_pos: int) -> tuple[list[str], int]:
    lines = []
    with open(path, "r", encoding="utf-8") as f:
        f.seek(last_pos)
        # CHANGE 2: Track the position before each readline so we can roll back if the line has no trailing newline (partial/unflushed line at EOF).
        current_pos = f.tell()
        while True:
            line = f.readline()
            if line == "":
                # EOF reached; new_pos stays at current_pos (before this empty read)
                break
            # CHANGE 1: Use `continue` instead of `break` for blank lines so we skip them without stopping the read loop.
            stripped = line.strip("\n")
            if stripped == "":
                # Skip blank lines but keep reading
                current_pos = f.tell()
                continue
            # CHANGE 2: Only advance current_pos when the line ends with a newline; a line without a trailing newline is partial and should be re-read next poll.
            if not line.endswith("\n"):
                # Partial line — do not advance position; it will be re-read when the writer flushes more data.
                break
            lines.append(stripped)
            current_pos = f.tell()
        new_pos = current_pos
    return lines, new_pos
```

## Explanation

### Issue 1: Blank Lines Terminate Loop Early

**Problem:** When the log file contains a blank line (a bare `\n`), `stripped` becomes an empty string and the code hits `break`, stopping all further reading. Every log line written after the blank line is silently ignored until a future poll cycle re-reads from the same `last_pos`, which causes erratic, delayed processing.

**Fix:** Replace `break` with `continue` inside the `if stripped == "":` block, and update `current_pos` before continuing. This skips the blank line and moves on to the next `readline()` call.

**Explanation:** `readline()` returns `"\n"` for a blank line — that is not EOF, so the outer `if line == "":` guard does not fire. The code then strips the newline, gets `""`, and hits the second guard. The original `break` exits the loop entirely, leaving the file pointer somewhere in the middle of the file. On the next poll, `last_pos` still points before the blank line, so the function re-reads it and breaks again — making all content after the blank line unreachable until a restart. Changing to `continue` means the loop keeps going and eventually returns the lines that follow.

---

### Issue 2: Partial Line at EOF Advances Position, Causing Duplicates

**Problem:** When a writer flushes a line without a trailing newline (common at end-of-file before the write is complete), `readline()` returns the partial content, the code appends it to `lines`, and `new_pos` is set to `f.tell()` — which is now past the partial line. On the next poll, reading starts after the partial line, so it is never re-read. But the alerting pipeline has already seen it once, and if the writer later appends a newline and more data, the now-complete first line has been consumed and lost, or the partial was fed to the pipeline prematurely.

**Fix:** Before each `readline()`, save the current position in `current_pos`. After reading a line, check `line.endswith("\n")`. If the newline is absent, the line is partial — `break` without appending it and without advancing `current_pos`. Return `current_pos` (the position before the partial read) as `new_pos`.

**Explanation:** `f.tell()` always reports where the file pointer ended up after the read, regardless of whether the line was complete. A partial line at EOF moves the pointer to end-of-file, so `new_pos` jumps past the unfinished content. The next poll starts there, meaning the partial line is never re-read once the writer finishes it. By rolling back to the position recorded before the partial `readline()`, the next poll re-reads the same bytes and will see the complete line (with its newline) once the writer has flushed it. A related pitfall: if the file is rotated and a new file starts at position 0, the caller is responsible for resetting `last_pos` to 0 — the position-rollback logic here does not interfere with that.
