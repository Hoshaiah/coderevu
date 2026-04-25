## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — StreamWriter Buffered Data Lost on Dispose
// ------------------------------------------------------------------------

public class CsvExporter
{
    public void Export(IEnumerable<Employee> employees, string outputPath)
    {
        var fs = new FileStream(outputPath, FileMode.Create, FileAccess.Write);
        var writer = new StreamWriter(fs);

        writer.WriteLine("Id,Name,Department,Salary");

        foreach (var emp in employees)
        {
            writer.WriteLine(
                $"{emp.Id},{Escape(emp.Name)},{Escape(emp.Department)},{emp.Salary:F2}");
        }

        // CHANGE 1: Dispose the StreamWriter instead of the raw FileStream so its internal buffer is flushed before the file is closed; disposing fs directly skips that flush.
        writer.Dispose();
    }

    // CHANGE 2: Remove the stray leading space inside the interpolated quoted string so comma-containing fields are wrapped as "value" not " value".
    private static string Escape(string value) =>
        value.Contains(',') ? $"\"{value}\"" : value;
}
```

## Explanation

### Issue 1: StreamWriter buffer not flushed before close

**Problem:** CSV files written with more than a few thousand rows arrive at the SFTP destination missing their final rows. The amount of missing data varies because it depends on how much data happened to be sitting in `StreamWriter`'s internal write buffer at the moment the file was closed.

**Fix:** Replace `fs.Dispose()` with `writer.Dispose()`. `StreamWriter.Dispose` calls `Flush` internally before closing, which drains the in-memory buffer to the underlying `FileStream` and ultimately to disk.

**Explanation:** `StreamWriter` maintains its own in-memory buffer (default 4 096 bytes) and writes to the underlying stream only when that buffer fills up or is explicitly flushed. When you call `fs.Dispose()` directly, you close the OS file handle without ever telling `StreamWriter` to empty its buffer, so whatever data is still in that buffer at that moment is silently discarded. Small exports finish under 4 KB total and the buffer never accumulates much, so they appear correct — the buffer just happens to be nearly empty by the time `Dispose` is called after the loop. Large exports always have a partial buffer at the end. Disposing the `StreamWriter` instead causes it to flush first, then close the underlying stream, so no data is lost. A related pitfall: calling `writer.Flush()` before `fs.Dispose()` would also work, but disposing the writer is the idiomatic, exception-safe approach.

---

### Issue 2: Stray leading space in Escape quoted output

**Problem:** Any CSV field whose value contains a comma gets wrapped in double quotes, but the output contains an extra leading space — e.g., `" John, Smith"` instead of `"John, Smith"`. Downstream systems that parse the CSV strictly will either reject the row or store the field value with a leading space.

**Fix:** Change `$"\"{ value}\""` to `$"\"{value}\""` — remove the space between the opening brace and `value` in the interpolation hole inside the `Escape` method.

**Explanation:** In a C# interpolated string, `{ value}` is valid syntax — the space is inside the interpolation hole and is treated as part of the expression, which compiles fine because C# ignores leading/trailing whitespace around the expression token itself. However, the *intent* was to write the value immediately after the opening quote with no extra characters. The result is that every escaped field gets a spurious space prepended, which corrupts any field that contains a comma. The fix is to write `{value}` with no spaces inside the braces.
