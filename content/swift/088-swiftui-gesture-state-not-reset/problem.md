---
slug: swiftui-gesture-state-not-reset
track: swift
orderIndex: 88
title: GestureState Not Reset on Cancel
difficulty: medium
tags:
  - swiftui
  - concurrency
  - gesture
  - state
language: swift
---

## Context

This code is in `DraggableCard.swift`, a SwiftUI view for a card UI where users can drag cards to reorder them. A `@GestureState` is used to track the current drag offset, and a `@State` variable accumulates the final position after each drag ends. The pattern is a standard drag-and-drop implementation.

Users report that after receiving a phone call (which interrupts the gesture) or receiving a system alert mid-drag, the card jumps to an unexpected position when the user next touches it. The card appears to remember a partial drag offset from the interrupted gesture.

The team confirmed `@GestureState` is used correctly for temporary state and `@State` for persistent state. They ruled out issues with the gesture recognizer priority and confirmed `DragGesture` is configured correctly.

## Buggy code

```swift
import SwiftUI

struct DraggableCard: View {
    @State private var finalOffset: CGSize = .zero
    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.blue)
            .frame(width: 200, height: 120)
            .offset(
                x: finalOffset.width + dragOffset.width,
                y: finalOffset.height + dragOffset.height
            )
            .gesture(
                DragGesture()
                    .updating($dragOffset) { value, state, _ in
                        state = value.translation
                    }
                    .onEnded { value in
                        finalOffset.width  += value.translation.width
                        finalOffset.height += value.translation.height
                        // BUG: also manually add dragOffset thinking it holds final translation
                        finalOffset.width  += dragOffset.width
                        finalOffset.height += dragOffset.height
                    }
            )
    }
}
```
