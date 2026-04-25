## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Decimal Context Modified Globally
# ------------------------------------------------------------------------

import decimal
from decimal import Decimal, localcontext

DEFAULT_TAX_RATE = Decimal("0.0875")

def compute_tax(
    amount: Decimal,
    rate: Decimal = DEFAULT_TAX_RATE,
    high_precision: bool = False,
) -> Decimal:
    """
    Compute tax amount. Use high_precision for large transactions
    to avoid rounding errors.
    """
    # CHANGE 1: Use localcontext() so precision changes are confined to this thread's local context instead of mutating the shared global context, which caused non-deterministic rounding under concurrent load.
    # CHANGE 2: Use 28 (Python default) instead of 6 as the non-high-precision value so callers outside this function are not silently affected by a reduced precision global.
    with localcontext() as ctx:
        if high_precision:
            ctx.prec = 10
        else:
            ctx.prec = 28

        tax = (amount * rate).quantize(
            Decimal("0.01"), rounding=decimal.ROUND_HALF_UP
        )
    return tax

def compute_invoice_total(subtotal: Decimal, high_precision: bool = False) -> dict:
    tax = compute_tax(subtotal, high_precision=high_precision)
    return {
        "subtotal": subtotal,
        "tax": tax,
        "total": subtotal + tax,
    }
```

## Explanation

### Issue 1: Thread-unsafe Global Context Mutation

**Problem:** Two threads running `compute_tax` concurrently can overwrite each other's `decimal.getcontext().prec` setting. Thread A sets precision to 10 for a high-precision call, then Thread B sets it to 6 before Thread A has finished its multiplication, so Thread A's intermediate arithmetic runs at the wrong precision. The result is a rounding discrepancy that only appears under load, exactly as the accounting team observed.

**Fix:** Replace the direct `decimal.getcontext().prec = ...` assignments with a `with localcontext() as ctx:` block and set `ctx.prec` on the local context object instead. The `localcontext()` context manager creates a per-thread copy of the decimal context for the duration of the `with` block.

**Explanation:** Python's `decimal` module stores its default context in a thread-local variable, but `decimal.getcontext()` returns the context for the *current* thread — so far so good. The problem is that `getcontext()` called from two threads returns two different objects, yet setting `.prec` on either one is a mutation that persists for all subsequent decimal operations on that thread until something changes it again. Under gunicorn with threads, both workers share the same OS thread pool. If Thread A processes a high-precision invoice and Thread B simultaneously processes a standard invoice, Thread B resets the precision to 6 after Thread A set it to 10 but before Thread A calls `.quantize()`. `localcontext()` creates a temporary copy scoped to the `with` block, so the moment the block exits the original context is restored; no other operation on the same thread is affected and cross-thread interference is impossible.

---

### Issue 2: Non-high-precision Path Lowers Global Precision to 6

**Problem:** Every call to `compute_tax` with `high_precision=False` permanently drops the process-wide decimal precision from Python's default of 28 significant digits down to 6. Any code that runs after `compute_tax` on the same thread — whether inside this module or anywhere else in the application — will perform arithmetic at 6-digit precision until something raises it again.

**Fix:** Change the `else` branch from `ctx.prec = 6` to `ctx.prec = 28`, matching the Python `decimal` module default, so the normal-precision path does not silently degrade other calculations.

**Explanation:** Python sets the default decimal precision to 28 digits. Forcing it to 6 is both lower than necessary for correct `quantize` behavior on multi-digit tax amounts and a latent hazard for every other `Decimal` operation that runs on the same thread afterward. For example, a subtotal like `Decimal("123456.78")` multiplied by a rate at 6-digit precision yields only 6 significant figures, dropping the less-significant digits before `quantize` even runs. Once `localcontext()` is used (Issue 1 fix), the scope of this override is contained, but setting 28 instead of 6 is still correct because it preserves the expected behavior for the normal path and avoids surprising precision loss on moderately large amounts.
