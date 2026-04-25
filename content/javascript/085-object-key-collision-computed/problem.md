---
slug: object-key-collision-computed
track: javascript
orderIndex: 85
title: Computed Key Collision Silently Overwrites
difficulty: medium
tags:
  - correctness
  - closures
  - types
language: javascript
---

## Context

This ETL helper lives in `src/transforms/groupByCategory.js`. It groups an array of product records by their `category` field and is used before feeding batched records to a reporting database. The input comes from a third-party supplier CSV and may contain products from many categories.

The nightly reporting job shows that certain categories are always missing from the output, even though those products are present in the raw import file. The missing categories turn out to be those whose names, when lowercased, match JavaScript's built-in Object prototype property names: `"constructor"`, `"toString"`, `"hasOwnProperty"`, etc.

No error is thrown. The function returns successfully with a smaller-than-expected result object. The supplier has confirmed those products are present in the exported file.

## Buggy code

```javascript
/**
 * Groups an array of products by their category.
 * @param {Array<{id: string, name: string, category: string, price: number}>} products
 * @returns {Record<string, Array>} grouped products
 */
function groupByCategory(products) {
  const groups = {};

  for (const product of products) {
    const key = product.category.toLowerCase().trim();

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(product);
  }

  return groups;
}

module.exports = { groupByCategory };
```
