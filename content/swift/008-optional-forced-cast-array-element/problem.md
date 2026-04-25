---
slug: optional-forced-cast-array-element
track: swift
orderIndex: 8
title: Force Cast Silently Crashes Array
difficulty: easy
tags:
  - optionals
  - casting
  - crash
language: swift
---

## Context

This snippet lives in `ProductListViewController.swift`, a UIKit screen that loads heterogeneous items from a shared `DataStore`. The store vends `[Any]` because it also holds ads, banners, and promoted items alongside real `Product` values. The view controller filters for products before displaying them.

Users on the beta track intermittently see the app crash with `EXC_BAD_INSTRUCTION` on the products screen, but only when the backend includes a promotional banner in the middle of the feed. The crash stack points to the cell-configuration loop. The marketing team recently added a new item type called `FeaturedBanner` to the feed without notifying the iOS team.

Local testing with a clean cache never reproduces it because the local mock data contains only `Product` items. The bug only surfaces against the staging or production endpoint where banners appear.

## Buggy code

```swift
final class ProductListViewController: UIViewController {
    private var items: [Any] = []

    func configure(with rawItems: [Any]) {
        // Keep only items that look like products
        items = rawItems.filter { $0 is Product || $0 is SponsoredProduct }
    }

    func tableView(_ tableView: UITableView,
                   cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(
            withIdentifier: "ProductCell", for: indexPath) as! ProductCell

        let item = items[indexPath.row]
        // Cast to the shared protocol so we can use display helpers
        let displayable = item as! ProductDisplayable
        cell.configure(with: displayable)
        return cell
    }
}
```
