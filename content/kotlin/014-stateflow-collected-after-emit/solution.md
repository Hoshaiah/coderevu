## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — StateFlow Collector Misses First Emission
// ------------------------------------------------------------------------

// OnboardingViewModel.kt
import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class OnboardingViewModel : ViewModel() {
    // CHANGE 1: Initialize MutableStateFlow directly to Step.Welcome instead of null, so the current value is always a valid Step and StateFlow's replay-of-one-value behaviour delivers it to any late collector automatically.
    private val _step = MutableStateFlow<Step>(Step.Welcome)
    // CHANGE 2: Expose StateFlow<Step> (non-nullable) so callers never need a null guard and the type system reflects that there is always a current step.
    val step: StateFlow<Step> = _step

    // init block that set _step.value = Step.Welcome is removed; the constructor above handles it.

    fun advance(next: Step) {
        _step.value = next
    }
}

// OnboardingFragment.kt — inside onViewCreated
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        // CHANGE 3: Collect StateFlow<Step> (non-nullable); remove the `if (step != null)` guard that was previously hiding whether the welcome step was actually received.
        viewModel.step.collect { step ->
            navigateTo(step)
        }
    }
}
```

## Explanation

### Issue 1: StateFlow initialized to null instead of first step

**Problem:** The `MutableStateFlow` starts as `null`, then `init` immediately sets it to `Step.Welcome`. Because this assignment happens during ViewModel construction — before the fragment's view exists — the StateFlow's current value is already `Step.Welcome` when the fragment calls `collect`. StateFlow replays exactly one value (its current value) to new collectors, so the fragment *does* receive `Step.Welcome`. The null-initialized approach works by accident here, but it introduces a window during which `step.value` is `null`, which is meaningless for a wizard that always has a current step.

**Fix:** Replace `MutableStateFlow<Step?>(null)` with `MutableStateFlow<Step>(Step.Welcome)` (CHANGE 1) and remove the `init` block assignment. The flow is valid from the moment the ViewModel is constructed.

**Explanation:** `StateFlow` is a *state holder*, not an event stream. It always has a current value and replays that value to each new subscriber. Setting the initial value to `null` and writing the real value in `init` creates a two-step initialization where the type `Step?` must carry a sentinel that has no domain meaning. Any code path that reads `step.value` synchronously (e.g., saved-state restoration, unit tests) can observe `null` if it runs between construction and `init`. Initializing the flow directly to `Step.Welcome` collapses those two steps into one and makes the type accurately reflect the invariant that a step is always present.

---

### Issue 2: Nullable StateFlow type forces a null guard that obscures correct flow delivery

**Problem:** The fragment's collector checks `if (step != null) navigateTo(step)`. This guard was added because the flow was typed `StateFlow<Step?>`, but it silently swallows the case where the fragment subscribes late and the current value happens to still be `null` (e.g., during a very early fragment attach). More importantly, it gives the false impression that a `null` emission is a normal, expected condition rather than a design smell.

**Fix:** Change the exposed type to `StateFlow<Step>` (CHANGE 2) and remove the `if (step != null)` null-check in the collector (CHANGE 3), calling `navigateTo(step)` unconditionally.

**Explanation:** When `StateFlow` is parameterized with a non-nullable type, the compiler enforces that every emission is a real `Step`. The collector no longer needs a guard, and `navigateTo` receives a `Step` directly. This also prevents a subtle future bug: if a developer later adds a second subscriber that reads `step.value` directly (e.g., in a menu handler), they won't have to remember to null-check it. Removing the nullable indirection makes the contract between ViewModel and Fragment explicit in the type signature itself.
