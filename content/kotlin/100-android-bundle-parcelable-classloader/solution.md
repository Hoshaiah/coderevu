## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Bundle Restore Missing ClassLoader
// ------------------------------------------------------------------------

import android.os.Build
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
            // CHANGE 1: Set the ClassLoader on the bundle to the app's classloader before reading any Parcelable; OEM ROMs on Android 10 restore bundles with the boot ClassLoader, which cannot find app classes.
            savedInstanceState.classLoader = UserProfile::class.java.classLoader
            // CHANGE 2: Use the type-safe getParcelable(String, Class) overload on API 33+ and fall back to the legacy overload with an explicit cast on older APIs, removing the unchecked raw call.
            userProfile = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                savedInstanceState.getParcelable("user_profile", UserProfile::class.java)
            } else {
                @Suppress("DEPRECATION")
                savedInstanceState.getParcelable("user_profile") as? UserProfile
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        userProfile?.let { outState.putParcelable("user_profile", it) }
    }
}
```

## Explanation

### Issue 1: Missing ClassLoader on Restored Bundle

**Problem:** On certain OEM devices running Android 10 (Samsung, Xiaomi), the system restores a Fragment's `savedInstanceState` bundle using the boot `ClassLoader` instead of the application's `ClassLoader`. When `getParcelable` tries to deserialize `UserProfile`, it cannot find the class and throws `ClassNotFoundException`. This never happens on Pixel devices because AOSP uses the correct ClassLoader.

**Fix:** Before reading any key from `savedInstanceState`, call `savedInstanceState.classLoader = UserProfile::class.java.classLoader`. This pins the bundle's ClassLoader to the one that loaded `UserProfile`, guaranteeing it can be found during deserialization.

**Explanation:** Android parcels store class names as strings. When a parcel is unmarshalled, `Bundle` asks its associated `ClassLoader` to resolve those names. A freshly restored bundle from the system has no ClassLoader set (or has the system boot ClassLoader), so it falls back to `Class.forName` against a loader that only knows framework classes — not your app's classes. Setting `bundle.classLoader` before any read forces every subsequent deserialization in that bundle to use the right loader. This also affects any nested `Parcelable` or `Serializable` objects inside `UserProfile`. A related pitfall: if you call `getParcelable` first and then set the ClassLoader, the fix has no effect — the order matters.

---

### Issue 2: Unchecked Raw getParcelable Call

**Problem:** The original call `savedInstanceState.getParcelable("user_profile")` uses the raw, deprecated single-argument overload. The compiler infers the return type from context but does not verify it, producing an unchecked cast warning that is silently suppressed. On API 33+ this overload is deprecated and its behavior differs slightly across versions.

**Fix:** Replace the raw call with a conditional: on API 33+ (`Build.VERSION_CODES.TIRAMISU`) use `getParcelable("user_profile", UserProfile::class.java)`, which is type-safe and non-nullable per the API contract. On older APIs, use the deprecated overload with an explicit `as? UserProfile` cast and a targeted `@Suppress("DEPRECATION")`.

**Explanation:** The two-argument `getParcelable(String, Class<T>)` overload introduced in API 33 passes the expected class directly into the parcel unmarshalling path, so the runtime can validate the type before returning it. The old overload relies on an unchecked generic inference, which means a wrong key or a type mismatch silently returns `null` or throws a `ClassCastException` somewhere else in your code, making debugging harder. Splitting on `Build.VERSION_CODES.TIRAMISU` is the idiomatic AndroidX pattern; you can also wrap this in a utility extension to avoid repeating the branch everywhere.
