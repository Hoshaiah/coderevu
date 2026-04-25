## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — InputStream Read Returns -1 As Data
// ------------------------------------------------------------------------

import java.io.ByteArrayOutputStream
import java.io.InputStream

object FileParser {

    fun readNullTerminatedString(stream: InputStream): String {
        val buffer = ByteArrayOutputStream()
        var byte: Int
        do {
            byte = stream.read()
            // CHANGE 1: Guard against EOF (-1) in addition to null terminator; without this, -1 is cast to 0xFF and written into the buffer, producing a spurious ÿ character.
            if (byte != 0x00 && byte != -1) {
                buffer.write(byte)
            }
        // CHANGE 2: Stop the loop on EOF (-1) as well as null terminator so a stream without a trailing 0x00 does not loop forever or consume garbage data.
        } while (byte != 0x00 && byte != -1)
        return buffer.toString(Charsets.UTF_8.name())
    }
}
```

## Explanation

### Issue 1: EOF Value Written as 0xFF Byte

**Problem:** When a string field is the last item in the file and there is no null terminator, `stream.read()` returns `-1` to signal end-of-stream. The code checks only for `0x00` before calling `buffer.write(byte)`, so `-1` passes the guard and is written. `ByteArrayOutputStream.write(int)` truncates the value to the low 8 bits, turning `-1` (0xFFFFFFFF) into `0xFF`. Decoded as UTF-8, `0xFF` alone is not valid UTF-8 but Java's decoder emits the replacement or interprets it as the Latin-1 character `ÿ`, which is exactly what users see appended to otherwise correct strings.

**Fix:** At CHANGE 1, the condition inside the loop is extended from `byte != 0x00` to `byte != 0x00 && byte != -1`, so an EOF return value is never passed to `buffer.write()`.

**Explanation:** `InputStream.read()` documents that it returns an `int` in the range 0–255 for actual data and `-1` for end-of-stream. The method signature uses `int` precisely so that -1 can be distinguished from any valid byte value. If you pass `-1` directly to `write(int)`, the JVM keeps only the lowest 8 bits: `-1 & 0xFF = 255 = 0xFF`. `ByteArrayOutputStream` then holds a `0xFF` byte. Whether that produces `ÿ` or a replacement character depends on the UTF-8 decoder's error mode, but on many Android devices the default lenient decoder emits `0xFF` as the Latin-1 supplement character `ÿ`. The fix is to treat `-1` the same way you treat `0x00`: skip writing it.

---

### Issue 2: Loop Does Not Terminate on End-of-Stream

**Problem:** After `stream.read()` returns `-1` once (EOF), a well-behaved `InputStream` continues returning `-1` on every subsequent call. The original `while` condition only checks `byte != 0x00`, so the loop never exits, spinning forever and producing an unbounded stream of `0xFF` bytes in the buffer. This would eventually exhaust memory or hang the app, though in practice most streams are closed after EOF so an `IOException` may interrupt it first.

**Fix:** At CHANGE 2, the loop condition is extended to `byte != 0x00 && byte != -1`, mirroring the write guard, so the loop exits as soon as EOF is detected.

**Explanation:** The do-while loop must agree with the write guard about which values are "terminal". If the write guard silently drops `-1` but the loop condition does not stop on `-1`, the loop re-reads the stream, gets `-1` again, drops it again, and repeats indefinitely. Adding `-1` to the exit condition means the loop and the write guard use exactly the same set of sentinel values. A related pitfall: if the stream is a network socket that blocks rather than returning -1 repeatedly, the loop would block instead of spinning, making the hang invisible in profiling but still present.
