---
slug: decimal-context-global-mutation
track: python
orderIndex: 30
title: Decimal Context Modified Globally
difficulty: medium
tags:
  - concurrency
  - correctness
  - decimal
language: python
---

## Context

This financial calculation module lives in `billing/tax_calculator.py`. It uses Python's `decimal` module to compute tax amounts with configurable precision. For certain tax jurisdictions, the precision needs to be increased to 10 significant digits to avoid rounding errors on large transaction amounts. The module is used by a multi-threaded web worker (gunicorn with threads).

Accounting reconciliation jobs have reported sporadic rounding discrepancies in invoices — amounts that should be identical across runs sometimes differ by a penny. The discrepancies appear only during periods of high traffic, suggesting a concurrency issue. The bug is non-deterministic: running the same calculation in a single-threaded test always produces the correct result.

The team has confirmed the input data is deterministic (same transaction ID always yields the same inputs) and that the database is not involved in the rounding path. They isolated the bug to the `compute_tax` function itself under concurrent load.

## Buggy code

```python
import decimal
from decimal import Decimal

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
    if high_precision:
        decimal.getcontext().prec = 10
    else:
        decimal.getcontext().prec = 6

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
