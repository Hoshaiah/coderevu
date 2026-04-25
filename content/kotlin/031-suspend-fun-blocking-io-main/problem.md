---
slug: suspend-fun-blocking-io-main
track: kotlin
orderIndex: 31
title: Blocking IO Inside suspend on Main
difficulty: hard
tags:
  - coroutines
  - android
  - performance
language: kotlin
---

## Context

In `data/local/SettingsStore.kt`, user settings are persisted to a file using plain Java `FileOutputStream`. The function is marked `suspend` and is called from `viewModelScope.launch` in a Fragment, which the developer assumed would automatically offload the work to a background thread.

On slow devices, the UI freezes for up to 2 seconds when settings are saved. The ANR dialog occasionally appears. Profiling shows the main thread is blocked inside `FileOutputStream.write`. The `suspend` keyword alone does not move execution off the calling thread.

The developer confirmed the code is being called from `viewModelScope.launch {}` with no explicit dispatcher. `viewModelScope` uses `Dispatchers.Main` by default in the Android ViewModel.

## Buggy code

```kotlin
import java.io.File
import java.io.FileOutputStream

class SettingsStore(private val file: File) {

    // Marked suspend but runs on whatever thread the caller uses
    suspend fun saveSettings(settings: Map<String, String>) {
        val content = settings.entries.joinToString("\n") { "${it.key}=${it.value}" }
        FileOutputStream(file).use { stream ->
            stream.write(content.toByteArray())
        }
    }
}
```
