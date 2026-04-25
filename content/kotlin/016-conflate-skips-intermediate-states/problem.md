---
slug: conflate-skips-intermediate-states
track: kotlin
orderIndex: 16
title: conflate Drops Intermediate Progress Updates
difficulty: medium
tags:
  - coroutines
  - flow
  - collections
language: kotlin
---

## Context

In `ui/upload/UploadViewModel.kt`, a file upload emits progress updates as a `Flow<Int>` (0–100). The Flow is conflated before being collected in the UI so that the collector (which updates a ProgressBar) is not overwhelmed if it is slower than the producer.

QA reports that the progress bar sometimes jumps from 0% directly to 100% without animating through intermediate values, and in some cases the upload completes but the progress bar is still showing 45% — it never receives the final 100 value. The upload itself succeeds; only the UI feedback is broken.

The team verified the producer emits every integer from 0 to 100. The issue appears only when the device is under load (e.g., during a benchmark). They increased the emission delay thinking the collector was too slow, but the problem persisted.

## Buggy code

```kotlin
import kotlinx.coroutines.flow.*

class UploadViewModel : ViewModel() {

    private val _progress = MutableSharedFlow<Int>()
    val progress: Flow<Int> = _progress.conflate()

    fun startUpload(fileBytes: ByteArray) {
        viewModelScope.launch {
            for (percent in 0..100) {
                _progress.emit(percent)
                delay(20)
            }
        }
    }
}
```
