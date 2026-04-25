## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Disposed Stream Returned to Caller
// ------------------------------------------------------------------------

public async Task<Stream> DownloadFileAsync(string containerName, string blobName)
{
    var containerClient = _blobServiceClient.GetBlobContainerClient(containerName);
    var blobClient = containerClient.GetBlobClient(blobName);

    // CHANGE 1: Removed `using` so the MemoryStream is NOT disposed when the method returns; ownership transfers to the caller.
    var memoryStream = new MemoryStream();
    var response = await blobClient.DownloadToAsync(memoryStream);

    if (!response.IsError)
    {
        // CHANGE 2: Reset Position to 0 so the caller reads from the beginning of the downloaded data, not from the end.
        memoryStream.Position = 0;
        return memoryStream;
    }

    memoryStream.Dispose();
    throw new InvalidOperationException(
        $"Blob download failed with status {response.Status}");
}
```

## Explanation

### Issue 1: `using` Disposes Stream Before Caller Reads It

**Problem:** Users receive empty file downloads or see `ObjectDisposedException: Cannot access a closed Stream` in the middleware. The file content was downloaded successfully, but the response body is unreadable by the time ASP.NET Core tries to serialize it.

**Fix:** Remove the `using` keyword from the `var memoryStream = new MemoryStream()` declaration so the stream is not disposed at the end of the method scope. Add an explicit `memoryStream.Dispose()` only on the error path, before throwing, so resources are still cleaned up when the download fails.

**Explanation:** The `using` statement calls `Dispose()` on `memoryStream` the moment execution leaves the block — which is the moment `return memoryStream` executes. The caller receives a reference to an already-disposed object. When ASP.NET Core's `FileStreamResult` tries to copy that stream to the response body (which happens asynchronously, after the controller method returns), the stream is closed and throws. Unit tests that call `.ToArray()` immediately inside the method scope complete before disposal, which is why they pass. The fix transfers ownership of the stream to the caller; the framework disposes it after the response is fully written.

---

### Issue 2: Stream Position Left at End After Download

**Problem:** Even if the `using`-disposal bug were not present, calling `DownloadToAsync` writes all bytes into the stream and leaves the internal position pointer at the very end. A caller that reads from that position gets zero bytes.

**Fix:** The existing `memoryStream.Position = 0;` line inside the `if (!response.IsError)` block is correct and must be kept. In the buggy code it is present but rendered moot by the disposal bug; in the fixed code it does useful work.

**Explanation:** `DownloadToAsync` appends data by writing sequentially, advancing `Position` to `Length` when finished. Reading from a stream starts at the current `Position`, so reading from the end produces nothing. Setting `Position = 0` rewinds the stream so the first byte the caller reads is the first byte of the blob. A related pitfall: if you later wrap this stream in a `StreamReader` or another decorator without rewinding, you hit the same zero-byte symptom, so it is good practice to document that the returned stream is rewound and ready to read.
