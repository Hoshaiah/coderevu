## Reference solution

```kotlin
// ------------------------------------------------------------------------
// ANSWER — Bundle Put/Get Type Mismatch
// ------------------------------------------------------------------------

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
                    // CHANGE 1: use putString instead of putInt so getString can retrieve it; putInt stores an Int under the key, getString returns null for that key.
                    // CHANGE 2: pass productId directly instead of productId.hashCode() to preserve the original string value rather than a numeric hash.
                    putString(ARG_PRODUCT_ID, productId)
                }
            }
        }
    }
}
```

## Explanation

### Issue 1: Wrong Bundle put method (putInt vs putString)

**Problem:** The product detail screen always displays the fallback label "unknown" instead of the actual product. Logcat shows no exceptions, and the developer confirmed `getString` returns `null` after retrieval.

**Fix:** Replace `putInt(ARG_PRODUCT_ID, ...)` with `putString(ARG_PRODUCT_ID, productId)` at the CHANGE 1 site. This stores the value under the key with the `String` type so that `getString` can find and return it.

**Explanation:** Android's `Bundle` is a typed key-value store. When you call `putInt(key, value)`, the bundle records both the key and a type tag of `Int`. When `getString(key)` is called later, the bundle looks up the key, sees that the stored type is `Int` instead of `String`, and returns `null` — no exception is thrown. Because the result is `null`, the Elvis operator `?: "unknown"` substitutes the fallback. The fix aligns the write and read types so the bundle returns the stored value.

---

### Issue 2: hashCode() discards the original string value

**Problem:** Even if the type mismatch were corrected independently, the bundle would store `productId.hashCode()` — an `Int` — not the original product ID string. The screen would show an integer hash code, not the real ID.

**Fix:** Remove the `.hashCode()` call at the CHANGE 2 site and pass `productId` directly to `putString`. The raw string is now what gets bundled and later retrieved.

**Explanation:** `String.hashCode()` returns a 32-bit `Int` that is derived from the string's characters. Two different strings can share the same hash (collision), and the mapping is one-way — you cannot recover the original string from the hash. Passing the hash to a method that expects a product ID means the retrieved value is at best an unrecognizable integer and at worst collides with another product's hash. The correct approach is to store the value you intend to read back without transformation.
