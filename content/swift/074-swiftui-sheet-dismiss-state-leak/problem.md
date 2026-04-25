---
slug: swiftui-sheet-dismiss-state-leak
track: swift
orderIndex: 74
title: Sheet Dismissed But State Not Reset
difficulty: easy
tags:
  - swiftui
  - state
  - sheet
  - correctness
language: swift
---

## Context

`Views/ItemListView.swift` shows a list of items. Tapping a row sets a `@State` optional to the selected item, which presents a modal sheet. Inside the sheet a user can delete the item. On deletion the view model removes it from the published array and the sheet is dismissed by setting the selected item back to `nil`.

Users report that after deleting an item and then tapping a different row immediately, the sheet sometimes shows the previously-deleted item's data for a brief flash before updating. More critically, if they tap the same-position row (now containing a different item), the sheet opens and immediately shows stale data from the deleted item before snapping to the correct content.

The team ruled out a view model bug — the published array is updated correctly and immediately. They also confirmed the sheet's content view is reading from the binding, not from a local copy. The flash only happens on fast interactions.

## Buggy code

```swift
import SwiftUI

struct ItemListView: View {
    @StateObject private var viewModel = ItemListViewModel()
    @State private var selectedItem: Item?

    var body: some View {
        List(viewModel.items, id: \.id) { item in
            Text(item.name)
                .onTapGesture {
                    selectedItem = item
                }
        }
        .sheet(item: $selectedItem) { item in
            ItemDetailView(
                item: item,
                onDelete: {
                    viewModel.delete(item: item)
                    // Dismiss the sheet
                    selectedItem = nil
                }
            )
        }
    }
}

struct ItemDetailView: View {
    let item: Item
    let onDelete: () -> Void

    var body: some View {
        VStack {
            Text(item.name).font(.title)
            Button("Delete", role: .destructive, action: onDelete)
        }
    }
}
```
