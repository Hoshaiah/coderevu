---
slug: nullable-lateinit-delegate-crash
track: kotlin
orderIndex: 48
title: Lateinit Val Used as Non-Null Delegate
difficulty: easy
tags:
  - nullability
  - android
  - lifecycle
language: kotlin
---

## Context

This `Fragment` lives in `ProfileFragment.kt` and uses View Binding. The binding is assigned in `onViewCreated` and is supposed to be cleared in `onDestroyView` to avoid leaking the view hierarchy — a common Android best practice. A custom `autoCleared` delegate from the project's internal `FragmentExtensions.kt` is used to manage the lifecycle automatically.

Users on certain low-memory devices report intermittent crashes with `UninitializedPropertyAccessException` when navigating back to the profile screen after the app has been in the background for a while. The stack trace points to a binding access inside an observer.

The team confirmed the delegate clears the reference in `onDestroyView` as expected. They ruled out threading issues since all access is on the main thread.

## Buggy code

```kotlin
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

        viewModel.userName.observe(viewLifecycleOwner, Observer { name ->
            binding.nameTextView.text = name
        })

        viewModel.profilePicture.observe(viewLifecycleOwner, Observer { url ->
            binding.avatarImageView.load(url)
        })
    }

    override fun onDestroyView() {
        super.onDestroyView()
        // autoCleared delegate handles nulling out binding
    }
}
```
