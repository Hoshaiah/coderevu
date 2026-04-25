---
slug: stateflow-collected-after-emit
track: kotlin
orderIndex: 14
title: StateFlow Collector Misses First Emission
difficulty: medium
tags:
  - coroutines
  - stateflow
  - android
language: kotlin
---

## Context

In `ui/onboarding/OnboardingViewModel.kt`, a `StateFlow<Step>` drives an onboarding wizard. The ViewModel emits the first step immediately in its `init` block. The Fragment collects the flow in `onViewCreated` to react to step changes and navigate between wizard screens.

Users report that the first screen of the wizard is blank on cold launch. Subsequent steps work correctly. Logcat shows that `viewModel.step` emits `Step.Welcome` before the Fragment's collector is registered, so the fragment never sees that event and never sets up the welcome UI.

The team tried moving collection to `onStart` with no improvement. They ruled out configuration changes since the issue reproduces on a fresh install with no rotation.

## Buggy code

```kotlin
// OnboardingViewModel.kt
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class OnboardingViewModel : ViewModel() {
    private val _step = MutableStateFlow<Step?>(null)
    val step: StateFlow<Step?> = _step

    init {
        _step.value = Step.Welcome
    }

    fun advance(next: Step) {
        _step.value = next
    }
}

// OnboardingFragment.kt — inside onViewCreated
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.step.collect { step ->
            if (step != null) navigateTo(step)
        }
    }
}
```
