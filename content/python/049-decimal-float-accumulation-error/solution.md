## Reference solution

```python
# ------------------------------------------------------------------------
# ANSWER — Float Accumulation in Financial Totals
# ------------------------------------------------------------------------

from typing import List
from decimal import Decimal, ROUND_HALF_UP

def compute_invoice_total(
    line_items: List[dict],
    # CHANGE 2: Accept tax_rate as a string or Decimal so it converts to an exact Decimal without float representation error.
    tax_rate: str = "0.08",
) -> str:
    """
    Sum line item amounts and add tax.
    Each line item dict has 'unit_price' (float or str) and 'quantity' (int).
    Returns the total as a string representation of a value rounded to 2 decimal places.
    """
    # CHANGE 1: Use Decimal arithmetic for accumulation instead of float to avoid binary floating-point drift across many additions.
    subtotal = Decimal("0")
    for item in line_items:
        unit_price = Decimal(str(item["unit_price"]))
        subtotal += unit_price * item["quantity"]

    # CHANGE 2: Multiply by a Decimal tax_rate to keep the full computation in exact decimal arithmetic.
    tax = subtotal * Decimal(str(tax_rate))
    total = subtotal + tax
    # CHANGE 1: Quantize to exactly 2 decimal places using ROUND_HALF_UP to match standard financial rounding, then return as string for safe storage.
    return str(total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
```

## Explanation

### Issue 1: Float Accumulation Skews Subtotal

**Problem:** Customers receive quotes computed with exact decimal arithmetic (e.g., in a spreadsheet or a quoted price sheet), but the stored invoice total is off by one cent. Accounting sees the ledger sum of line items not matching the sum of stored totals.

**Fix:** Replace the `float` accumulator `subtotal = 0.0` and `float` arithmetic with `Decimal("0")` and `Decimal(str(item["unit_price"]))` accumulation. The final `round(total, 2)` is replaced with `total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)` and the function returns a `str`.

**Explanation:** Binary floating-point cannot represent most decimal fractions exactly. `0.1` in IEEE 754 is actually `0.1000000000000000055511151231257827021181583404541015625`. When you add many such values, the small errors accumulate. After enough additions the accumulated error crosses a rounding boundary, so `round()` rounds in the wrong direction by one unit in the last place — exactly one cent. `Decimal` with string initialization stores the number as an exact decimal coefficient and exponent, so `Decimal("0.10") + Decimal("0.20")` is exactly `Decimal("0.30")`. Using `str()` to convert an incoming `float` before passing it to `Decimal` is important: `Decimal(0.1)` inherits the float's representation error, while `Decimal("0.1")` does not.

---

### Issue 2: Float tax_rate Compounds Representation Error

**Problem:** Even if the subtotal were exact, multiplying by a `float` tax rate such as `0.08` introduces a new representation error. `0.08` in IEEE 754 is not exactly 8/100, so the computed tax amount is slightly wrong before `round()` is even called.

**Fix:** Change the `tax_rate` parameter default from the `float` literal `0.08` to the string `"0.08"`, and inside the function convert it with `Decimal(str(tax_rate))` before multiplying. This keeps the entire tax computation in exact decimal arithmetic.

**Explanation:** `0.08` as a Python `float` is stored as the closest representable binary fraction, which is `0.08000000000000000166533453693773481063544750213623046875`. Multiplying a subtotal by this value instead of the exact fraction 8/100 produces a tax figure that is fractionally too large or too small. After rounding to two decimal places, the total may be one cent off. Accepting `tax_rate` as a string (or `Decimal`) and converting with `Decimal(str(...))` ensures the rate is the mathematically correct decimal value. A related pitfall: callers who pass a pre-computed `float` tax rate from another part of the system will still get the wrong answer unless they also convert to `str` first, which is why documenting the expected type or accepting `Decimal` directly is preferable in a production billing context.
