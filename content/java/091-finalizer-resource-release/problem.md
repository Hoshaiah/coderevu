---
slug: finalizer-resource-release
track: java
orderIndex: 91
title: Resource Released Only in Finalizer
difficulty: hard
tags:
  - exceptions
  - resource-management
  - correctness
language: java
---

## Context

`src/main/java/com/acme/io/NativeFileHandle.java` wraps a native file descriptor obtained from a JNI layer. The developer used `finalize()` as a safety net to ensure the native handle is always released, even if the caller forgets to call `close()`. This class is used heavily in a document-processing service that opens thousands of files per minute.

The service runs stably for a few hours, then native file descriptors are exhausted and all subsequent file operations fail with `Too many open files`. The JVM heap is not under pressure, so GC is not running frequently, and finalizers are only invoked during GC. The native handle pool is set to 65 536 and the service clearly is not opening that many files simultaneously.

Thread dumps show the finalizer queue growing without bound. A heap dump confirms thousands of `NativeFileHandle` objects waiting to be finalized. Explicitly calling `close()` in callers is not consistently done.

## Buggy code

```java
public class NativeFileHandle {
    private long nativeHandle;
    private boolean closed = false;

    public NativeFileHandle(String path) {
        this.nativeHandle = nativeOpen(path);
    }

    public byte[] read(int length) {
        if (closed) throw new IllegalStateException("Handle is closed");
        return nativeRead(nativeHandle, length);
    }

    public void close() {
        if (!closed) {
            nativeClose(nativeHandle);
            closed = true;
        }
    }

    @Override
    protected void finalize() throws Throwable {
        close();
    }

    private native long nativeOpen(String path);
    private native byte[] nativeRead(long handle, int length);
    private native void nativeClose(long handle);
}
```
