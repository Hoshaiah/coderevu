---
slug: android-bundle-wrong-key-type
track: kotlin
orderIndex: 90
title: Bundle Put/Get Type Mismatch
difficulty: easy
tags:
  - android
  - nullability
  - collections
language: kotlin
---

## Context

This fragment factory method lives in `com/example/app/ui/ProductDetailFragment.kt`. It creates a new fragment instance, bundles the product ID as an argument, and retrieves it in `onCreate`. This is the standard Android pattern for passing primitive arguments to fragments.

In production, the product detail screen always shows the fallback "unknown" product instead of the correct one. The fragment is created correctly in the backstack. Logcat shows no exceptions. The developer added a log line after the `getString` call and confirmed the retrieved ID is always `null`.

The developer has verified the correct non-null product ID string is being passed to `newInstance`.

## Buggy code

```kotlin
import androidx.fragment.app.Fragment
import android.os.Bundle

class ProductDetailFragment : Fragment() {

    private var productId: String = "unknown"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        productId = arguments?.getString(ARG_PRODUCT_ID) ?: "unknown"
    }

    companion object {
        private const val ARG_PRODUCT_ID = "product_id"

        fun newInstance(productId: String): ProductDetailFragment {
            return ProductDetailFragment().apply {
                arguments = Bundle().apply {
                    putInt(ARG_PRODUCT_ID, productId.hashCode())
                }
            }
        }
    }
}
```
