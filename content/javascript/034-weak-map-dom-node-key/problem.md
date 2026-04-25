---
slug: weak-map-dom-node-key
track: javascript
orderIndex: 34
title: WeakMap Keyed on Primitive
difficulty: easy
tags:
  - types
  - api-misuse
  - memory
language: javascript
---

## Context

This utility lives in `src/ui/tooltip-registry.js`. It manages a global registry of tooltip metadata keyed to DOM elements. A WeakMap is intentionally used so that if a node is removed from the DOM and garbage-collected, the associated metadata is automatically cleaned up — avoiding a classic memory leak.

Operators have started noticing that tooltips are sometimes not rendering or showing stale content. In the browser console, an intermittent `TypeError: Invalid value used as weak map key` crashes the tooltip initializer, but only for certain input types.

The team already confirmed the DOM nodes themselves are valid HTML elements in the working cases. The bug only manifests when the caller passes a node ID string (e.g., `'tooltip-anchor-42'`) instead of the resolved element, suggesting some call sites are using a different convention.

## Buggy code

```javascript
const tooltipMeta = new WeakMap();

function registerTooltip(nodeOrId, options) {
  const key = typeof nodeOrId === 'string'
    ? nodeOrId
    : nodeOrId;

  if (tooltipMeta.has(key)) {
    return tooltipMeta.get(key);
  }

  const meta = {
    content: options.content,
    placement: options.placement ?? 'top',
    createdAt: Date.now(),
  };

  tooltipMeta.set(key, meta);
  return meta;
}

function unregisterTooltip(nodeOrId) {
  const key = typeof nodeOrId === 'string'
    ? nodeOrId
    : nodeOrId;
  tooltipMeta.delete(key);
}
```
