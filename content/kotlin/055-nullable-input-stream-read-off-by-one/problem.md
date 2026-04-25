---
slug: nullable-input-stream-read-off-by-one
track: kotlin
orderIndex: 55
title: InputStream Read Returns -1 As Data
difficulty: medium
tags:
  - nullability
  - correctness
  - android
language: kotlin
---

## Context

This file utility lives in `FileParser.kt` in an Android app that processes binary configuration files downloaded from a server. It reads a file byte-by-byte from an `InputStream`, stopping at a null byte (0x00) as a string terminator, and accumulates bytes into a `ByteArrayOutputStream` to decode as a UTF-8 string.

Users loading certain configuration files see garbled data at the end of string fields — often a `ÿ` character (0xFF) appended to otherwise correct strings. The issue only affects strings that are the last field in the file, and only on some devices. The configuration file contents verified correct when hex-dumped.

The developer noticed the corruption always involves `0xFF` and suspected an encoding issue, but changing the charset had no effect.

## Buggy code

```kotlin
import java.io.ByteArrayOutputStream
import java.io.InputStream

object FileParser {

    fun readNullTerminatedString(stream: InputStream): String {
        val buffer = ByteArrayOutputStream()
        var byte: Int
        do {
            byte = stream.read()
            if (byte != 0x00) {
                buffer.write(byte)
            }
        } while (byte != 0x00)
        return buffer.toString(Charsets.UTF_8.name())
    }
}
```
