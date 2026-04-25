---
slug: decimal-float-accumulation-error
track: python
orderIndex: 49
title: Float Accumulation in Financial Totals
difficulty: easy
tags:
  - correctness
  - perf
  - numeric
language: python
---

## Context

This function is in `billing/invoice.py` and computes the total amount due on an invoice. It is called before charging a customer's payment method and the result is stored in the `invoices` table as a `NUMERIC(12,2)` column.

Customers have filed complaints that their invoice totals are off by one cent compared to what they were quoted. Accounting has flagged a growing reconciliation gap — the sum of stored invoice totals does not match the sum of individual line items in the ledger. The discrepancy is always one cent, always in the same direction.

A developer inspected the stored values and confirmed that `0.1 + 0.2` in the Python REPL does not equal `0.3`, which led them to suspect floating-point representation, but they weren't sure how to fix it cleanly.

## Buggy code

```python
from typing import List

def compute_invoice_total(
    line_items: List[dict],
    tax_rate: float = 0.08,
) -> float:
    """
    Sum line item amounts and add tax.
    Each line item dict has 'unit_price' (float) and 'quantity' (int).
    Returns the total as a float rounded to 2 decimal places.
    """
    subtotal = 0.0
    for item in line_items:
        subtotal += item["unit_price"] * item["quantity"]

    tax = subtotal * tax_rate
    total = subtotal + tax
    return round(total, 2)
```
