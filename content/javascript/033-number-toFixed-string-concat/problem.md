---
slug: number-toFixed-string-concat
track: javascript
orderIndex: 33
title: 'toFixed Returns String, Not Number'
difficulty: easy
tags:
  - types
  - correctness
  - arithmetic
language: javascript
---

## Context

This function lives in `src/utils/pricing.js` and calculates the final price after applying a discount percentage. It is used in the checkout flow to display prices and to send the final amount to the payment processor. The discount percentage comes from a promotional codes table.

Customers report incorrect totals at checkout. A 10% discount on a $50 item shows `$45.005.00` in the UI instead of `$45.00`. The payment processor occasionally receives strings like `"45.005.00"` and rejects the charge. The bug only appears when a discount is applied — items at full price work correctly.

The team checked the discount values in the database and confirmed they are stored as valid numbers. They also verified that `basePrice` is always a JavaScript `number` type when passed to this function.

## Buggy code

```javascript
/**
 * @param {number} basePrice - price in dollars
 * @param {number} discountPct - e.g. 10 for 10% off
 * @returns {number} final price rounded to 2 decimal places
 */
function applyDiscount(basePrice, discountPct) {
  const discounted = basePrice - (basePrice * discountPct) / 100;
  const rounded = discounted.toFixed(2);
  return rounded;
}

function formatPrice(price) {
  return `$${applyDiscount(price.base, price.discountPct).toFixed(2)}`;
}

module.exports = { applyDiscount, formatPrice };
```
