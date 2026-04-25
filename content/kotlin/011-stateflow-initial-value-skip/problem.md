---
slug: stateflow-initial-value-skip
track: kotlin
orderIndex: 11
title: StateFlow Collector Misses First Emission
difficulty: medium
tags:
  - coroutines
  - android
  - flows
language: kotlin
---

## Context

This is in `ui/LoginFragment.kt` in an Android app. The Fragment collects from a `StateFlow<LoginUiState>` exposed by the ViewModel. The initial state is `LoginUiState.Idle`. After the user taps login, the ViewModel emits `LoginUiState.Loading`, then `LoginUiState.Success` or `LoginUiState.Error`.

Users report that the loading spinner occasionally never appears — the screen goes directly from the idle state to the success screen without showing a loading indicator. It happens most often on low-end devices. The ViewModel logic has been verified to emit `Loading` correctly via unit tests.

## Buggy code

```kotlin
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.Lifecycle
import kotlinx.coroutines.launch

class LoginFragment : Fragment() {

    private val viewModel: LoginViewModel by viewModels()

    override fun onStart() {
        super.onStart()
        lifecycleScope.launch {
            viewModel.uiState.collect { state ->
                renderState(state)
            }
        }
    }

    private fun renderState(state: LoginUiState) { /* ... */ }
}
```
