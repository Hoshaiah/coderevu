---
slug: lateinit-before-init
track: kotlin
orderIndex: 43
title: lateinit Access Before Initialization
difficulty: easy
tags:
  - nullability
  - android
  - lifecycle
language: kotlin
---

## Context

`ui/ProfileFragment.kt` displays user profile data. It uses `lateinit var` for a view binding reference, which is standard practice to avoid nullable types for views that are always present once the fragment is attached.

Users report intermittent crashes with `UninitializedPropertyAccessException: lateinit property binding has not been initialized` in the crash dashboard. Stack traces point to `onDestroyView`, specifically the cleanup code that tries to nullify a listener. The crash rate spikes whenever users navigate away from the screen quickly.

The team assumed `onDestroyView` only fires after `onViewCreated`, so the binding would always be ready. The crash happening in `onDestroyView` itself seemed impossible — until they checked the Fragment lifecycle more carefully.

## Buggy code

```kotlin
import androidx.fragment.app.Fragment
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup

class ProfileFragment : Fragment() {
    private lateinit var binding: FragmentProfileBinding

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return try {
            binding = FragmentProfileBinding.inflate(inflater, container, false)
            binding.root
        } catch (e: Exception) {
            null  // returns null if inflation fails
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        binding.profileImage.setImageDrawable(null)
    }
}
```
