---
slug: object-finalize-close-not-guaranteed
track: java
orderIndex: 83
title: finalize() Resource Release Not Guaranteed
difficulty: medium
tags:
  - exceptions
  - nulls
  - concurrency
language: java
---

## Context

This class is `src/main/java/com/example/storage/NativeBuffer.java`. It wraps a native off-heap memory buffer allocated via JNI. The developer relies on `finalize()` to release the native memory when the Java object is garbage collected, since there is no obvious call site where a `close()` call could be inserted.

Operators see the JVM process growing in resident memory until the OS kills it, even though heap usage reported by GC logs stays flat. Native memory profiling confirms off-heap allocations are never freed. The problem worsens under high object allocation rates, where GC cycles are more frequent but finalization still falls behind.

The team confirmed the `free()` JNI function itself works correctly when called directly in a test harness.

## Buggy code

```java
public class NativeBuffer {
    private long nativePtr;

    public NativeBuffer(int capacity) {
        this.nativePtr = allocate(capacity); // JNI call
    }

    public void write(byte[] data) {
        if (nativePtr == 0) throw new IllegalStateException("Buffer freed");
        writeNative(nativePtr, data);
    }

    @Override
    protected void finalize() throws Throwable {
        if (nativePtr != 0) {
            free(nativePtr);
            nativePtr = 0;
        }
    }

    private native long allocate(int capacity);
    private native void writeNative(long ptr, byte[] data);
    private native void free(long ptr);
}
```
