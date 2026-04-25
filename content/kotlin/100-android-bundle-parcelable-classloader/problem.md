---
slug: android-bundle-parcelable-classloader
track: kotlin
orderIndex: 100
title: Bundle Restore Missing ClassLoader
difficulty: hard
tags:
  - android
  - nullability
  - correctness
language: kotlin
---

## Context

`ProfileFragment.kt` saves a custom `Parcelable` object into the Fragment's `onSaveInstanceState` bundle and restores it in `onViewCreated`. This is standard Fragment state restoration used to survive configuration changes and process death. The `UserProfile` class is defined in the app module.

Users report a crash on screen rotation on some devices (primarily Samsung and Xiaomi with Android 10). Firebase shows `ClassNotFoundException: com.example.app.UserProfile` thrown from `Bundle.getParcelable`. The crash does not happen in the emulator or on Pixel devices.

The team confirmed `UserProfile` implements `Parcelable` correctly (verified with Parcelize plugin). The issue only manifests on restore, never on save. Adding `@Suppress` on the getParcelable call does not fix it — it still throws at runtime.

## Buggy code

```kotlin
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment

class ProfileFragment : Fragment() {

    private var userProfile: UserProfile? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.fragment_profile, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        if (savedInstanceState != null) {
            userProfile = savedInstanceState.getParcelable("user_profile")
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        userProfile?.let { outState.putParcelable("user_profile", it) }
    }
}
```
