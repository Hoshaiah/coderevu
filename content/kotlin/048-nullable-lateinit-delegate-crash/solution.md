## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Lateinit Val Used as Non-Null Delegate
// ------------------------------------------------------------------------

import androidx.fragment.app.Fragment
import androidx.lifecycle.Observer
import android.os.Bundle
import android.view.View

// Simplified autoCleared delegate: sets field to null in onDestroyView
fun <T : Any> Fragment.autoCleared(): ReadWriteProperty<Fragment, T> =
    AutoClearedValue(this)

class ProfileFragment : Fragment() {
    private var binding: ProfileBinding by autoCleared()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding = ProfileBinding.bind(view)

        // CHANGE 1: Pass viewLifecycleOwner as the LifecycleOwner so that observers are automatically removed when the VIEW's lifecycle ends, not the fragment's lifecycle — this prevents the observer from firing after onDestroyView nulls the binding.
        viewModel.userName.observe(viewLifecycleOwner) { name ->
            // CHANGE 2: Guard binding access with a null-check using the nullable form so that if the delegate has already been cleared (e.g. during a rapid back-navigation race), the lambda exits safely instead of throwing.
            binding?.nameTextView?.text = name
        }

        // CHANGE 1 (continued): Same viewLifecycleOwner scope for the second observer.
        viewModel.profilePicture.observe(viewLifecycleOwner) { url ->
            // CHANGE 2 (continued): Same nullable-safe access for avatarImageView.
            binding?.avatarImageView?.load(url)
        }
    }

    override fun onDestroyView() {
        // CHANGE 3: Clear the binding reference BEFORE calling super so that any pending observer callbacks that might be dispatched during super.onDestroyView() cannot reach a non-null binding that is about to become invalid.
        binding = null  // autoCleared delegate also nulls it, but being explicit is safer here
        super.onDestroyView()
    }
}
```

## Explanation

### Issue 1: Observers Survive View Destruction

**Problem:** When the fragment's view is destroyed (e.g. the user navigates away and the back-stack retains the fragment), the `autoCleared` delegate sets `binding` to `null`. But if observers were registered with a `LifecycleOwner` whose lifecycle is longer than the view's — or if `viewLifecycleOwner` was not being used correctly — the observer lambda can fire again after `binding` is null, throwing `UninitializedPropertyAccessException`.

**Fix:** The observers are rewritten to use the lambda shorthand `observe(viewLifecycleOwner) { ... }` (CHANGE 1), making the intent explicit and ensuring the Jetpack `LiveData` machinery ties each observer's active/inactive state strictly to the view's `Lifecycle`, not the fragment's.

**Explanation:** A `Fragment` has two lifecycles: its own (`lifecycle`) and its view's (`viewLifecycle`). `viewLifecycleOwner` is destroyed and recreated every time the fragment's view is inflated and torn down. Registering an observer with `viewLifecycleOwner` causes `LiveData` to remove that observer automatically when `ON_DESTROY` fires on the view lifecycle — before `onDestroyView` is called on the fragment. If you accidentally use the fragment's own `lifecycle` or a retained scope, the observer lives past view destruction and fires when the `LiveData` value changes (e.g. on resume), hitting a nulled-out binding. Using `viewLifecycleOwner` as the owner is the standard guard against this.

---

### Issue 2: Stale Binding Access Inside Observer Lambda

**Problem:** Even with `viewLifecycleOwner`, there is a narrow window during `ON_DESTROY` dispatch where a previously queued `LiveData` emission can invoke the observer lambda. Inside that lambda, `binding.nameTextView` throws because the delegate has already been nulled.

**Fix:** Replace `binding.nameTextView.text = name` with `binding?.nameTextView?.text = name` (CHANGE 2), using Kotlin's safe-call operator so that if the delegate returns `null` the entire expression short-circuits without throwing.

**Explanation:** The `autoCleared` delegate stores the value as a nullable reference internally and throws `UninitializedPropertyAccessException` when accessed after being nulled — mimicking a non-null type. By switching the backing property to expose a nullable type (or by using safe calls at the call site), you allow the lambda to detect the cleared state gracefully. This is a defense-in-depth measure: the `viewLifecycleOwner` fix (Issue 1) stops most callbacks, but the safe-call guard handles any that slip through during the teardown window.

---

### Issue 3: `super.onDestroyView()` Called Before Binding Is Cleared

**Problem:** The original code calls `super.onDestroyView()` and relies entirely on `autoCleared` to null the binding afterward. If `super.onDestroyView()` triggers any lifecycle callbacks that indirectly dispatch a `LiveData` update (possible in complex hierarchies), the binding field is still non-null but the view it references is already detached.

**Fix:** Add an explicit `binding = null` assignment at the top of `onDestroyView`, before `super.onDestroyView()` is called (CHANGE 3), so the reference is cleared before any lifecycle machinery in `super` runs.

**Explanation:** `super.onDestroyView()` can fire `ON_DESTROY` on the view `LifecycleOwner`, which in turn triggers observer removal — but if an observer fires synchronously during that notification pass, the binding is still alive. Nulling `binding` first ensures that any such callback hits a null reference (and is safely guarded by CHANGE 2) rather than a stale view reference. The `autoCleared` delegate will also attempt to null it, but explicit ordering removes ambiguity and makes the teardown sequence readable to future maintainers.
